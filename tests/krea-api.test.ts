import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { simulatedComfy } from './fixtures/comfy.js';
import { kreaInput, kreaNodes } from './fixtures/krea.js';
const cleanup:(()=>Promise<unknown>)[]=[];
afterEach(async()=>{for(const fn of cleanup.reverse()) await fn();cleanup.length=0;});
async function setup(){
  const dataDir=await mkdtemp(join(tmpdir(),'rgdqwer-krea-'));cleanup.push(()=>rm(dataDir,{recursive:true,force:true}));
  const fixture=await simulatedComfy({extraNodes:kreaNodes(),width:1024,height:1024});cleanup.push(fixture.close);
  const app=await createApp({dataDir});cleanup.push(()=>app.close());
  const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};
  const settings=(await app.inject({url:'/api/settings',headers})).json();
  await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...settings,comfyUrl:fixture.url}});
  const submit=(payload:Record<string,unknown>=kreaInput)=>app.inject({method:'POST',url:'/api/jobs',headers,payload});
  const job=async(id:string)=>(await app.inject({url:`/api/jobs/${id}`,headers})).json();
  return {app,headers,fixture,submit,job,dataDir};
}
it('requires authentication and reports inventory independently of SD checkpoints',async()=>{
  const {app,headers,fixture}=await setup();delete fixture.nodes.CheckpointLoaderSimple;
  expect((await app.inject({url:'/api/krea/status',headers:{host:'127.0.0.1'}})).statusCode).toBe(401);
  const result=await app.inject({url:'/api/krea/status',headers});expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({diffusionModels:expect.arrayContaining([kreaInput.checkpoint]),issues:[],engine:{state:'connected'}});
});
it('stores a Krea PNG and preserves its settings after reopening the database',async()=>{
  const {submit,job,app,headers,fixture,dataDir}=await setup();
  const response=await submit();expect(response.statusCode).toBe(202);const id=response.json().id;
  await expect.poll(async()=>(await job(id)).state,{timeout:5000}).toBe('completed');
  const result=await job(id);expect(result.input).toEqual(kreaInput);expect(result.workflowVersion).toBe('krea2-v1');
  expect(fixture.calls.find(c=>c.path==='/prompt')?.body).toMatchObject({prompt:{'11':{inputs:{type:'krea2'}},'3':{inputs:{cfg:1}}}});
  expect((await app.inject({url:`/api/artifacts/${result.artifacts[0].id}`,headers})).statusCode).toBe(200);
  expect((await app.inject({url:'/api/prompt-records',headers})).json()).toEqual([]);
  await app.close();const reopened=await createApp({dataDir});cleanup.push(()=>reopened.close());
  const token=(await reopened.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token;
  expect((await reopened.inject({url:`/api/jobs/${id}`,headers:{...headers,authorization:`Bearer ${token}`}})).json().input).toEqual(kreaInput);
});
it('shares the single active job lock with SD and cancels the Krea prompt only',async()=>{
  const {submit,job,fixture,app,headers}=await setup();fixture.control.autoFinish=false;
  const r=await submit();expect(r.statusCode).toBe(202);const id=r.json().id;
  const sd={profile:'sd15',checkpoint:'test.safetensors',prompt:'cat',negative:'',width:512,height:512,seed:1,steps:20,cfg:7};
  expect((await submit(sd)).statusCode).toBe(409);
  await expect.poll(()=>fixture.calls.some(c=>c.path==='/prompt')).toBe(true);
  await app.inject({method:'POST',url:`/api/jobs/${id}/cancel`,headers});
  await expect.poll(async()=>(await job(id)).state).toBe('cancelled');
  expect(fixture.calls.some(c=>c.path==='/interrupt')).toBe(false);
});
it('rechecks stale model inventory before submission and explains missing files',async()=>{
  const {submit,job,fixture,app,headers}=await setup();
  await app.inject({url:'/api/krea/status',headers});
  fixture.nodes.UNETLoader={input:{required:{unet_name:[[]],weight_dtype:[['default']]}}};
  const r=await submit();expect(r.statusCode).toBe(202);
  await expect.poll(async()=>(await job(r.json().id)).state).toBe('failed');
  expect((await job(r.json().id)).error).toContain(kreaInput.checkpoint);
  expect(fixture.calls.some(c=>c.path==='/prompt')).toBe(false);
});
it('rejects invalid RAW settings without creating or submitting a job',async()=>{
  const {submit,app,headers}=await setup();
  expect((await submit({...kreaInput,profile:'krea-raw'})).statusCode).toBe(400);
  expect((await app.inject({url:'/api/jobs',headers})).json()).toEqual([]);
});

it('persists the actual engine-expanded prompt including the LoRA trigger',async()=>{
  const {submit,job,fixture}=await setup();
  fixture.control.finalPrompt='A softly lit forest, monochrome ink wash style';
  const response=await submit({...kreaInput,enhancer:'engine',lora:{name:'krea2_darkbrush.safetensors',strength:1,trigger:'monochrome ink wash style'}});
  expect(response.statusCode).toBe(202);const id=response.json().id;
  await expect.poll(async()=>(await job(id)).state).toBe('completed');
  expect((await job(id)).effectivePrompt).toBe(fixture.control.finalPrompt);
  expect(fixture.calls.find(c=>c.path==='/prompt')?.body).toMatchObject({prompt:{'20':{class_type:'PreviewAny',inputs:{source:['17',0]}}}});
});
