import { afterEach,it,expect } from 'vitest';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { runProcess } from '../server/video/process.js';
import { defaultVideoInput, type VideoInput } from '../src/video.js';
import { simulatedComfy } from './fixtures/comfy.js';
import { videoNodes } from './fixtures/video.js';
const cleanup:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const f of cleanup.reverse())await f();cleanup.length=0;});
async function setup(){
 const dataDir=await mkdtemp(join(tmpdir(),'video-job-'));cleanup.push(()=>rm(dataDir,{recursive:true,force:true}));
 const app=await createApp({dataDir});cleanup.push(()=>app.close());
 const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};
 const file=join(dataDir,'source.mp4');await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=256x256:rate=24:duration=1','-frames:v','33','-vf','tpad=stop_mode=clone:stop_duration=1','-c:v','libx264','-pix_fmt','yuv420p',file]);
 const bytes=await readFile(file);
 const media=(await app.inject({method:'POST',url:'/api/media/video',headers:{...headers,'content-type':'application/octet-stream'},payload:bytes})).json();
 const input={...defaultVideoInput(),profile:'video-tools' as const,mode:'convert' as const,sourceId:media.id,width:256,height:256,frames:9,fps:12};
 const submit=(payload:VideoInput=input)=>app.inject({method:'POST',url:'/api/jobs',headers,payload});
 const job=async(id:string)=>(await app.inject({url:`/api/jobs/${id}`,headers})).json();return {app,headers,dataDir,input,submit,job,media,bytes};
}
it('converts actual MP4 without Comfy, shares lock, serves video and reopens durable settings',async()=>{
 const {app,headers,submit,job,input,dataDir,media}=await setup();
 const response=await submit();expect(response.statusCode).toBe(202);const id=response.json().id;
 expect((await submit()).statusCode).toBe(409);
 await expect.poll(async()=>(await job(id)).state,{timeout:10000}).toBe('completed');
 const result=await job(id);expect(result).toMatchObject({kind:'video',workflowVersion:'ffmpeg-v1',input,artifacts:[{mediaType:'video/mp4',frames:9,fps:12}]});
 expect((await app.inject({url:`/api/artifacts/${result.artifacts[0].id}`,headers})).headers['content-type']).toContain('video/mp4');
 expect((await app.inject({method:'DELETE',url:`/api/media/${media.id}`,headers})).statusCode).toBe(409);
 await app.close();const reopened=await createApp({dataDir});cleanup.push(()=>reopened.close());const auth={...headers,authorization:`Bearer ${(await reopened.inject({url:'/api/session',headers})).json().token}`};
 expect((await reopened.inject({url:`/api/jobs/${id}`,headers:auth})).json().input).toEqual(input);
},15000);
it('extracts multiple verified frame artifacts and cancels local preparation',async()=>{
 const {app,headers,submit,job,input}=await setup();const r=await submit({...input,mode:'extract',frames:3});expect(r.statusCode).toBe(202);
 await expect.poll(async()=>(await job(r.json().id)).state,{timeout:10000}).toBe('completed');expect((await job(r.json().id)).artifacts).toHaveLength(3);
 const cancelled=await submit();await app.inject({method:'POST',url:`/api/jobs/${cancelled.json().id}/cancel`,headers});
 await expect.poll(async()=>(await job(cancelled.json().id)).state).toBe('cancelled');
});
it('validates native Wan output and refuses stale models before submission',async()=>{
 const {app,headers,job,bytes}=await setup();const fixture=await simulatedComfy({extraNodes:videoNodes(),outputExtension:'mp4'});cleanup.push(fixture.close);fixture.control.outputBytes=bytes;
 const settings=(await app.inject({url:'/api/settings',headers})).json();await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...settings,comfyUrl:fixture.url}});
 const input={...defaultVideoInput(),width:256,height:256};
 const r=await app.inject({method:'POST',url:'/api/jobs',headers,payload:input});expect(r.statusCode).toBe(202);
 await expect.poll(async()=>(await job(r.json().id)).state,{timeout:10000}).toBe('completed');
 fixture.nodes.UNETLoader={input:{required:{unet_name:[[]],weight_dtype:[['default']]}}};
 const failed=await app.inject({method:'POST',url:'/api/jobs',headers,payload:input});await expect.poll(async()=>(await job(failed.json().id)).state).toBe('failed');
 expect((await job(failed.json().id)).error).toContain(input.checkpoint);
});
it('uploads an owned I2V PNG without overwrite and rejects corrupt or foreign outputs',async()=>{
 const {app,headers,job,bytes}=await setup();const {PNG}=await import('pngjs');const png=new PNG({width:256,height:256});png.data.fill(255);
 const upload=await app.inject({method:'POST',url:'/api/media/image',headers:{...headers,'content-type':'application/octet-stream'},payload:PNG.sync.write(png)});expect(upload.statusCode,upload.body).toBe(201);const source=upload.json();
 const fixture=await simulatedComfy({extraNodes:videoNodes(),outputExtension:'mp4'});cleanup.push(fixture.close);fixture.control.outputBytes=bytes;
 const settings=(await app.inject({url:'/api/settings',headers})).json();await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...settings,comfyUrl:fixture.url}});
 const input={...defaultVideoInput(),mode:'i2v',sourceId:source.id,width:256,height:256};
 const r=await app.inject({method:'POST',url:'/api/jobs',headers,payload:input});expect(r.statusCode).toBe(202);
 await expect.poll(async()=>(await job(r.json().id)).state,{timeout:10000}).toBe('completed');
 expect(fixture.calls.find(c=>c.path==='/upload/image')?.body).toMatchObject({name:`rgdqwer_${r.json().id}.png`,overwrite:'false'});
 fixture.control.outputBytes=Buffer.from('invalid MP4');
 const bad=await app.inject({method:'POST',url:'/api/jobs',headers,payload:input});await expect.poll(async()=>(await job(bad.json().id)).state,{timeout:10000}).toBe('failed');expect((await job(bad.json().id)).artifacts).toEqual([]);
 fixture.control.wrongOutput=true;
 const foreign=await app.inject({method:'POST',url:'/api/jobs',headers,payload:input});await expect.poll(async()=>(await job(foreign.json().id)).state).toBe('failed');
});
