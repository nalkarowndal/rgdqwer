import { it,expect } from 'vitest';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../server/video/process.js';
import { probeVideo,processVideo } from '../server/video/media.js';
import { defaultVideoInput } from '../src/video.js';
it('decodes real MP4, resizes, interpolates and extracts actual PNG frames',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'video-'));
 try {
  const source=join(dir,'source.mp4');
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=96x64:rate=8:duration=1','-c:v','libx264','-pix_fmt','yuv420p',source]);
  expect(await probeVideo(source)).toMatchObject({width:96,height:64,frames:8,fps:8});
  const input={...defaultVideoInput(),profile:'video-tools' as const,mode:'convert' as const,width:128,height:96,frames:12,fps:12,interpolation:'motion' as const};
  const output=join(dir,'output.mp4'); await processVideo(source,output,input);
  expect(await probeVideo(output)).toMatchObject({width:128,height:96,frames:12,fps:12});
  const frames=await processVideo(source,join(dir,'frame'),{...input,mode:'extract',frames:3});
  expect(frames).toHaveLength(3); expect((await readFile(frames[0])).subarray(1,4).toString()).toBe('PNG');
  await writeFile(join(dir,'fake.mp4'),'#EXTM3U\nhttp://127.0.0.1/secret');
  await expect(probeVideo(join(dir,'fake.mp4'))).rejects.toThrow();
 } finally {await rm(dir,{recursive:true,force:true});}
},30000);
it('terminates children on abort and bounds captured output',async()=>{
 const controller=new AbortController();
 const pending=runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],controller.signal); controller.abort();
 await expect(pending).rejects.toThrow();
 await expect(runProcess(process.execPath,['-e','process.stdout.write("x".repeat(2000000))'])).rejects.toThrow(/상한/);
});
it('authenticates binary upload, rejects fake MP4 and persists UUID-owned sources',async()=>{
 const {createApp}=await import('../server/app.js'); const {PNG}=await import('pngjs');
 const dir=await mkdtemp(join(tmpdir(),'media-api-')); const app=await createApp({dataDir:dir});
 try {
  const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};
  const png=new PNG({width:64,height:64});png.data.fill(255);const payload=PNG.sync.write(png);
  expect((await app.inject({method:'POST',url:'/api/media/image',headers:{host:'127.0.0.1','content-type':'application/octet-stream'},payload})).statusCode).toBe(401);
  const uploaded=await app.inject({method:'POST',url:'/api/media/image',headers:{...headers,'content-type':'application/octet-stream'},payload});expect(uploaded.statusCode).toBe(201);
  const media=uploaded.json();expect(media).toMatchObject({kind:'image',width:64,height:64});
  expect(await readFile(join(dir,'inputs',media.fileName))).toEqual(payload);
  expect((await app.inject({method:'POST',url:'/api/media/video',headers:{...headers,'content-type':'application/octet-stream'},payload:Buffer.from('#EXTM3U')})).statusCode).toBe(400);
  expect((await app.inject({url:`/api/media/${media.id}`,headers})).json()).toEqual(media);
  expect((await app.inject({method:'DELETE',url:`/api/media/${media.id}`,headers})).statusCode).toBe(200);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
