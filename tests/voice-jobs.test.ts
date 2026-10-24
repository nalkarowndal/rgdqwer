import { afterEach,it,expect,vi } from 'vitest';
import { mkdtemp,rm,readFile,readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
vi.mock('../server/video/process.js',async importOriginal=>{
 const original=await importOriginal<typeof import('../server/video/process.js')>();return {...original,runProcess:(program:string,args:string[],...rest:Parameters<typeof original.runProcess> extends [string,string[],...infer R]?R:never)=>program==='voice-fixture'?original.runProcess(process.execPath,[resolve('tests/fixtures/voice-worker.mjs'),...args.slice(1)],...rest):original.runProcess(program,args,...rest)};
});
import { createApp } from '../server/app.js';
import { runProcess } from '../server/video/process.js';
import { defaultVoiceInput } from '../src/voice.js';
const cleanup:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of cleanup.reverse())await fn();cleanup.length=0;vi.unstubAllEnvs();});
async function setup(){
 vi.stubEnv('STUDIO_CHATTERBOX_PYTHON','voice-fixture');
 const dataDir=await mkdtemp(join(tmpdir(),'voice-job-'));cleanup.push(()=>rm(dataDir,{recursive:true,force:true}));const app=await createApp({dataDir});cleanup.push(()=>app.close());
 const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};
 const file=join(dataDir,'ref.wav');await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=3','-ar','24000',file]);
 const source=(await app.inject({method:'POST',url:'/api/voice/audio/wav',headers:{...headers,'content-type':'application/octet-stream'},payload:await readFile(file)})).json();
 const profile=(await app.inject({method:'POST',url:'/api/voice/profiles',headers,payload:{name:'test',referenceId:source.id,languages:['ko'],engines:['chatterbox-tts','chatterbox-vc'],permission:'본인 녹음',authorized:true,defaults:{exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0}}})).json();
 const input={...defaultVoiceInput(),voiceProfileId:profile.id,prompt:'test speech'};
 const submit=(patch={})=>app.inject({method:'POST',url:'/api/jobs',headers,payload:{...input,...patch}});
 const job=async(id:string)=>(await app.inject({url:`/api/jobs/${id}`,headers})).json();return {app,dataDir,headers,profile,source,submit,job};
}
it('runs isolated audio job under shared lock, validates exports and stores permission snapshot',async()=>{
 const {app,headers,submit,job,profile,source}=await setup();const r=await submit();expect(r.statusCode,r.body).toBe(202);expect((await submit()).statusCode).toBe(409);
 await expect.poll(async()=>(await job(r.json().id)).state,{timeout:10000}).toBe('completed');const result=await job(r.json().id);
 expect(result).toMatchObject({kind:'audio',voiceProfile:profile,artifacts:[{mediaType:'audio/wav'},{mediaType:'audio/mpeg'}]});
 for(const artifact of result.artifacts){const response=await app.inject({url:`/api/artifacts/${artifact.id}`,headers});expect(response.statusCode).toBe(200);expect(response.rawPayload.length).toBeGreaterThan(100);}
 await app.inject({method:'DELETE',url:`/api/voice/profiles/${profile.id}`,headers});
 expect((await submit()).statusCode).toBe(400);expect((await app.inject({method:'DELETE',url:`/api/voice/audio/${source.id}`,headers})).statusCode).toBe(409);
});
it('cancels child, rejects corrupt/failed output and cleans all temporary files',async()=>{
 const {app,headers,submit,job,dataDir}=await setup();const slow=await submit({prompt:'slow'});expect(slow.statusCode).toBe(202);
 await expect.poll(async()=>(await job(slow.json().id)).state).toBe('running');await app.inject({method:'POST',url:`/api/jobs/${slow.json().id}/cancel`,headers});
 await expect.poll(async()=>(await job(slow.json().id)).state).toBe('cancelled');
 for(const prompt of ['bad','fail']){const r=await submit({prompt});await expect.poll(async()=>(await job(r.json().id)).state,{timeout:10000}).toBe('failed');expect((await job(r.json().id)).artifacts).toEqual([]);}
 expect(await readdir(join(dataDir,'voice-work'))).toEqual([]);expect(await readdir(join(dataDir,'outputs'))).toEqual([]);
});
it('shutdown interrupts local inference and restart never resubmits',async()=>{
 const {app,headers,submit,job,dataDir}=await setup();const r=await submit({prompt:'slow'});expect(r.statusCode).toBe(202);await expect.poll(async()=>(await job(r.json().id)).state).toBe('running');await app.close();
 const reopened=await createApp({dataDir});cleanup.push(()=>reopened.close());const auth={...headers,authorization:`Bearer ${(await reopened.inject({url:'/api/session',headers})).json().token}`};
 expect((await reopened.inject({url:`/api/jobs/${r.json().id}`,headers:auth})).json()).toMatchObject({state:'failed',artifacts:[]});
});
