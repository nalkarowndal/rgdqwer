import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {PNG} from 'pngjs';
import {createApp} from '../server/app.js';
import {simulatedComfy} from '../tests/fixtures/comfy.js';
import {parseSoakOptions,assessMemory} from './soak-report.js';
import type {Settings,Job} from '../src/contracts.js';
import type {InstalledAsset,ModelTask} from '../src/models.js';

const options=parseSoakOptions(process.argv.slice(2));
const directory=await mkdtemp(join(tmpdir(),'rgdqwer-soak-')),engine=await simulatedComfy();
let app:Awaited<ReturnType<typeof createApp>>|undefined,address='',token='',cycles=0,restarts=0,cancellations=0;
const started=Date.now(),samples:{cycle:number;elapsedMs:number;heapUsed:number;rss:number;resources:string[]}[]=[];
let failure:string|undefined;
async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{const response=await fetch(`${address}${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error(`${path}: ${response.status} ${await response.text()}`);return response.json() as Promise<T>;}
async function open(){app=await createApp({dataDir:directory});address=await app.listen({host:'127.0.0.1',port:0});token=(await fetch(`${address}/api/session`,{signal:AbortSignal.timeout(10000)}).then(r=>r.json()) as {token:string}).token;const settings=await api<Settings>('/api/settings');await api('/api/settings','PUT',{...settings,comfyUrl:engine.url});}
async function until<T>(read:()=>Promise<T>,done:(value:T)=>boolean){const end=Date.now()+15000;for(;;){const value=await read();if(done(value))return value;if(Date.now()>end)throw new Error(`Lifecycle timeout: ${JSON.stringify(value)}`);await delay(50);}}
function sample(){global.gc?.();const {heapUsed,rss}=process.memoryUsage();samples.push({cycle:cycles,elapsedMs:Date.now()-started,heapUsed,rss,resources:process.getActiveResourcesInfo().sort()});}
try{
 await open();const sourcePath=join(directory,'soak.safetensors');await writeFile(sourcePath,'synthetic model fixture');
 for(;cycles<options.cycles;){
  if(Date.now()-started>options.durationMs+120000)throw new Error('Soak hard deadline exceeded');
  const task=await api<ModelTask>('/api/models/import','POST',{sourcePath,confirmed:true,manifest:{name:'Soak fixture',kind:'checkpoint',family:'sd15',fileName:'soak.safetensors',license:'CC0',vramGiB:null}});
  const inventory=await until(()=>api<{assets:InstalledAsset[];tasks:ModelTask[]}>('/api/models'),v=>v.tasks.find(t=>t.id===task.id)?.state!=='running');assert.equal(inventory.tasks.find(t=>t.id===task.id)?.state,'completed');const asset=inventory.assets.find(a=>a.id===inventory.tasks.find(t=>t.id===task.id)?.assetId)!;assert.ok(asset);assert.equal(await readFile(join(asset.root,asset.relativePath),'utf8'),'synthetic model fixture');
  const checkpoint=asset.relativePath.replaceAll('\\','/').split('/').at(-1)!;engine.nodes.CheckpointLoaderSimple={input:{required:{ckpt_name:[[checkpoint]]}}};
  const input={profile:'sd15',checkpoint,prompt:'soak fixture',negative:'',width:512,height:512,seed:cycles,steps:1,cfg:1};
  const created=await api<Job>('/api/jobs','POST',input);const job=await until(()=>api<Job>(`/api/jobs/${created.id}`),v=>['completed','failed','unknown','interrupted'].includes(v.state));assert.equal(job.state,'completed',job.error??'');
  const response=await fetch(`${address}/api/artifacts/${job.artifacts[0].id}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});assert.equal(response.status,200);const png=PNG.sync.read(Buffer.from(await response.arrayBuffer()));assert.equal(png.width,512);assert.equal(png.height,512);
  await api(`/api/library/${job.id}`,'PUT',{favorite:true,title:`soak-${cycles}`});assert.equal((await api<{total:number}>(`/api/library?favorite=true&query=soak-${cycles}`)).total,1);
  if((cycles+1)%10===0){engine.control.autoFinish=false;const cancel=await api<Job>('/api/jobs','POST',input);await until(()=>api<Job>(`/api/jobs/${cancel.id}`),v=>v.state==='queued'||v.state==='running');const blocked=await fetch(`${address}/api/models/free`,{method:'POST',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});await blocked.text();assert.equal(blocked.status,409,'Maintenance must be blocked during generation');await api(`/api/jobs/${cancel.id}/cancel`,'POST',{});const terminal=await until(()=>api<Job>(`/api/jobs/${cancel.id}`),v=>['cancelled','failed','unknown'].includes(v.state));assert.equal(terminal.state,'cancelled');engine.control.autoFinish=true;cancellations++;}
  await api(`/api/models/${asset.id}/remove`,'POST',{confirmed:true,acknowledgedReferences:true});assert.equal((await api<{assets:InstalledAsset[]}>('/api/models')).assets.length,0);
  assert.equal((await readdir(asset.root)).some(name=>name.startsWith('.install-')),false);
  cycles++;
  if(cycles%20===0){await app!.close();app=undefined;assert.equal(engine.connections(),0);await open();restarts++;assert.equal((await api<Job>(`/api/jobs/${job.id}`)).state,'completed');assert.equal((await api<{total:number}>('/api/library?favorite=true')).total,cycles);}
  if(cycles>=5)sample();
  const target=started+options.durationMs*cycles/options.cycles;while(Date.now()<target)await delay(Math.min(1000,target-Date.now()));
 }
 assert.ok(Date.now()-started>=options.durationMs);assert.ok(assessMemory(samples).passed,'Memory diagnostic threshold exceeded');
}catch(error){failure=error instanceof Error?error.stack:String(error);}
finally{
 try{await app?.close();app=undefined;assert.equal(engine.connections(),0);}catch(error){failure??=String(error);}
 await engine.close();await rm(directory,{recursive:true,force:true});
}
const report={evidence:'simulated ComfyUI; real local HTTP, SQLite and files; no GPU inference',platform:process.platform,node:process.version,gcExposed:!!global.gc,elapsedMs:Date.now()-started,cycles,restarts,cancellations,samples,memory:samples.length>=2?assessMemory(samples):null,finalEngineConnections:engine.connections(),temporaryDataRemoved:true,finalResources:process.getActiveResourcesInfo().sort(),passed:!failure,failure};
await mkdir(dirname(options.report),{recursive:true});await writeFile(options.report,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,samples:report.samples.length}));if(failure)process.exitCode=1;
