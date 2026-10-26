import {it,expect,afterEach,vi} from 'vitest';
import {Writable,Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {downloadAsset} from '../server/models/download.js';
const fault=vi.hoisted(()=>({error:undefined as Error|undefined}));
vi.mock('node:fs',async importOriginal=>{const actual=await importOriginal<typeof import('node:fs')>();return {...actual,createWriteStream:(...args:Parameters<typeof actual.createWriteStream>)=>fault.error?new Writable({write(_chunk,_encoding,callback){setTimeout(()=>callback(fault.error),30);}}):actual.createWriteStream(...args)};});
const dirs:string[]=[];afterEach(async()=>{fault.error=undefined;for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
for(const latency of [10000,5])it(`preserves disk errors and stops range workers promptly (${latency}ms responses)`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'download-disk-'));dirs.push(dir);const data=Buffer.alloc(8*1024*1024,4);const controller=new AbortController();const diskError=Object.assign(new Error('ENOSPC disk full'),{code:'ENOSPC'});fault.error=diskError;let active=0,settled=false,caught:unknown;
 const work=downloadAsset('https://example.com/model',dir,'model.pt',data.length,createHash('sha256').update(data).digest('hex'),controller.signal,()=>{},'disk',async(_url,signal,options)=>{const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(options!.range!)!;const start=Number(a),end=Number(b);return {status:206,headers:{'content-range':`bytes ${start}-${end}/${data.length}`},body:Readable.from((async function*(){active++;try{if(start)await delay(latency,undefined,{signal});yield data.subarray(start,end+1);}finally{active--;}})())};}).catch(error=>{caught=error;}).finally(()=>{settled=true;});
 try{await expect.poll(()=>settled,{timeout:800,interval:20}).toBe(true);expect(caught).toBe(diskError);expect(active).toBe(0);expect(await readdir(dir)).toEqual([]);}finally{controller.abort();await work;}
});
it('releases model maintenance after disk failure while ranges are pending',async()=>{
 const {openStore}=await import('../server/store.js');const {GenerationManager}=await import('../server/generation/manager.js');const {ModelManager}=await import('../server/models/manager.js');
 const dir=await mkdtemp(join(tmpdir(),'download-lock-'));dirs.push(dir);const store=await openStore(dir),generation=new GenerationManager(store,dir),models=new ModelManager(store,dir,generation);await models.ready();vi.spyOn(models,'engineIdle').mockResolvedValue();fault.error=new Error('ENOSPC disk full');const total=8*1024*1024;
 const task=models.start('download','disk fixture',total,async(signal,progress,id)=>{await downloadAsset('https://example.com/model',models.root(),'model.pt',total,'0'.repeat(64),signal,progress,id,async(_url,requestSignal,options)=>{const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(options!.range!)!;const start=Number(a),end=Number(b);return {status:206,headers:{'content-range':`bytes ${start}-${end}/${total}`},body:Readable.from((async function*(){if(start)await delay(10000,undefined,{signal:requestSignal});yield Buffer.alloc(end-start+1);})())};});return undefined;});
 try{await expect.poll(()=>store.getModelTask(task.id)?.state,{timeout:800,interval:20}).toBe('failed');expect(store.getModelTask(task.id)?.error).toBe('ENOSPC disk full');const release=generation.acquireMaintenance();release();expect(store.listAssets()).toEqual([]);expect(await readdir(models.root())).toEqual([]);}finally{await models.close();await generation.close();store.close();}
});
