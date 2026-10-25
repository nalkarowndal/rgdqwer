import {afterEach,expect,it} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp} from '../server/app.js';import {simulatedComfy} from './fixtures/comfy.js';import {animaInput,imageNodes} from './fixtures/image.js';
const cleanup:(()=>Promise<unknown>)[]=[];afterEach(async()=>{for(const fn of cleanup.reverse())await fn();cleanup.length=0;});
async function setup(){
 const dataDir=await mkdtemp(join(tmpdir(),'rgdqwer-image-lora-'));cleanup.push(()=>rm(dataDir,{recursive:true,force:true}));
 const fixture=await simulatedComfy({extraNodes:imageNodes()});cleanup.push(fixture.close);
 const app=await createApp({dataDir});cleanup.push(()=>app.close());
 const headers={host:'127.0.0.1',authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}`};
 const settings=(await app.inject({url:'/api/settings',headers})).json();await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...settings,comfyUrl:fixture.url}});
 const submit=(payload:Record<string,unknown>)=>app.inject({method:'POST',url:'/api/jobs',headers,payload});
 const job=async(id:string)=>(await app.inject({url:`/api/jobs/${id}`,headers})).json();return {app,dataDir,headers,fixture,submit,job};
}
it('protects image inventory and supports Anima with no SD checkpoint',async()=>{
 const {app,headers,fixture}=await setup();delete fixture.nodes.CheckpointLoaderSimple;
 expect((await app.inject({url:'/api/image/status',headers:{host:'127.0.0.1'}})).statusCode).toBe(401);
 expect((await app.inject({url:'/%61pi/image/status',headers:{host:'127.0.0.1'}})).statusCode).toBe(401);
 const inv=(await app.inject({url:'/api/image/status',headers})).json();expect(inv).toMatchObject({checkpoints:[],diffusionModels:[animaInput.checkpoint],animaIssues:[]});
});
it('persists Anima and on/off adapters through actual job and database reopen',async()=>{
 const {app,dataDir,headers,fixture,submit,job}=await setup();
 const input={...animaInput,loras:[{name:'anima-style.safetensors',profile:'anima',enabled:true,strength:.7},{name:'missing.safetensors',profile:'sdxl',enabled:false,strength:1.2}]};
 const r=await submit(input);expect(r.statusCode).toBe(202);const id=r.json().id;
 await expect.poll(async()=>(await job(id)).state,{timeout:5000}).toBe('completed');expect((await job(id)).input).toEqual(input);expect((await job(id)).workflowVersion).toBe('anima-base-v1');
 expect(fixture.calls.find(c=>c.path==='/prompt')?.body).toMatchObject({prompt:{'3':{inputs:{model:['30',0],sampler_name:'er_sde'}},'30':{inputs:{lora_name:'anima-style.safetensors',strength_model:.7}}}});
 await app.close();const reopened=await createApp({dataDir});cleanup.push(()=>reopened.close());const token=(await reopened.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token;
 expect((await reopened.inject({url:`/api/jobs/${id}`,headers:{...headers,authorization:`Bearer ${token}`}})).json().input).toEqual(input);
});
it('rechecks removed active adapter before queue submission and allows it when disabled',async()=>{
 const {app,headers,fixture,submit,job}=await setup();await app.inject({url:'/api/image/status',headers});delete fixture.nodes.LoraLoaderModelOnly;
 const lora={name:'anima-style.safetensors',profile:'anima',enabled:true,strength:1};
 const r=await submit({...animaInput,loras:[lora]});expect(r.statusCode).toBe(202);
 await expect.poll(async()=>(await job(r.json().id)).state).toBe('failed');expect((await job(r.json().id)).error).toContain('LoraLoaderModelOnly');expect(fixture.calls.some(c=>c.path==='/prompt')).toBe(false);
 const off=await submit({...animaInput,loras:[{...lora,enabled:false}]});expect(off.statusCode).toBe(202);
 await expect.poll(async()=>(await job(off.json().id)).state,{timeout:5000}).toBe('completed');
});
it('rejects incompatible adapter or missing Anima encoder without creating jobs',async()=>{
 const {submit,app,headers}=await setup();
 for(const payload of [{...animaInput,textEncoder:undefined},{...animaInput,loras:[{name:'sd.safetensors',profile:'sdxl',enabled:true,strength:1}]}])expect((await submit(payload)).statusCode).toBe(400);
 expect((await app.inject({url:'/api/jobs',headers})).json()).toEqual([]);
});
