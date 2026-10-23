import { afterEach,it,expect } from 'vitest';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { runProcess } from '../server/video/process.js';
const cleanup:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of cleanup.reverse())await fn();cleanup.length=0;});
async function setup(){const dataDir=await mkdtemp(join(tmpdir(),'voice-'));cleanup.push(()=>rm(dataDir,{recursive:true,force:true}));const app=await createApp({dataDir});cleanup.push(()=>app.close());const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};return {app,headers,dataDir};}
async function wav(dir:string,seconds:number){const path=join(dir,`test-${seconds}.wav`);await runProcess('ffmpeg',['-v','error','-f','lavfi','-i',`sine=frequency=220:duration=${seconds}`,'-ar','24000',path]);return readFile(path);}
it('normalizes audio, persists profiles, protects references and requires permission',async()=>{
 const {app,headers,dataDir}=await setup();const payload=await wav(dataDir,3);
 expect((await app.inject({method:'POST',url:'/api/voice/audio/wav',headers:{host:'127.0.0.1','content-type':'application/octet-stream'},payload})).statusCode).toBe(401);
 const upload=await app.inject({method:'POST',url:'/api/voice/audio/wav',headers:{...headers,'content-type':'application/octet-stream'},payload});expect(upload.statusCode,upload.body).toBe(201);const source=upload.json();expect(source.duration).toBeCloseTo(3);
 const p={name:'내 목소리',referenceId:source.id,languages:['ko','ja','en'],engines:['chatterbox-tts','chatterbox-vc'],permission:'본인 녹음 및 사용 허가',authorized:true,defaults:{exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0}};
 expect((await app.inject({method:'POST',url:'/api/voice/profiles',headers,payload:{...p,authorized:false}})).statusCode).toBe(400);
 const saved=await app.inject({method:'POST',url:'/api/voice/profiles',headers,payload:p});expect(saved.statusCode,saved.body).toBe(201);expect(saved.json().consentedAt).toBeTruthy();
 expect((await app.inject({method:'DELETE',url:`/api/voice/audio/${source.id}`,headers})).statusCode).toBe(409);
 expect((await app.inject({url:`/api/voice/audio/${source.id}/file`,headers})).headers['content-type']).toContain('audio/wav');
 await app.close();const reopened=await createApp({dataDir});cleanup.push(()=>reopened.close());const auth={...headers,authorization:`Bearer ${(await reopened.inject({url:'/api/session',headers})).json().token}`};
 expect((await reopened.inject({url:'/api/voice/profiles',headers:auth})).json()[0]).toMatchObject(p);
 expect((await reopened.inject({method:'DELETE',url:`/api/voice/profiles/${saved.json().id}`,headers:auth})).statusCode).toBe(200);
 expect((await reopened.inject({method:'DELETE',url:`/api/voice/audio/${source.id}`,headers:auth})).statusCode).toBe(200);
});
it('rejects malformed and oversized duration, and short references',async()=>{
 const {app,headers,dataDir}=await setup();const upload=(payload:Buffer)=>app.inject({method:'POST',url:'/api/voice/audio/wav',headers:{...headers,'content-type':'application/octet-stream'},payload});
 expect((await upload(Buffer.from('invalid'))).statusCode).toBe(400);
 expect((await upload(await wav(dataDir,61))).statusCode).toBe(400);
 const short=await upload(await wav(dataDir,1));expect(short.statusCode).toBe(201);
 const bad=await app.inject({method:'POST',url:'/api/voice/profiles',headers,payload:{name:'short',referenceId:short.json().id,languages:['en'],engines:['chatterbox-vc'],permission:'my voice',authorized:true,defaults:{exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0}}});expect(bad.statusCode).toBe(400);
},15000);
