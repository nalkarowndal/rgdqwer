import {it,expect} from 'vitest';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID} from 'node:crypto';import {openStore} from '../server/store.js';import type {Job} from '../src/contracts.js';
it('pages and searches every persisted job, saves favorites and titles across reopen',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'library-'));let store=await openStore(dir);
 try{const ids:string[]=[];for(let i=0;i<105;i++){const id=randomUUID();ids.push(id);store.putJob({id,kind:'image',state:'completed',input:{profile:'sd15',checkpoint:'fixture.safetensors',prompt:`orchid ${i}`,negative:'',width:512,height:512,seed:i,steps:1,cfg:1},artifacts:[],createdAt:new Date(i*1000).toISOString(),error:null,progress:100,updatedAt:new Date().toISOString(),workflowVersion:'fixture',engineUrl:'http://127.0.0.1:8188',promptId:null,log:[],cancelRequested:false} satisfies Job);}
 expect(store.library({offset:100,limit:20,query:'orchid',kind:'all',favorite:false}).items).toHaveLength(5);
 expect(store.library({offset:0,limit:20,query:'orchid',kind:'all',favorite:false}).total).toBe(105);
 expect(store.markLibrary(ids[0],{favorite:true,title:'나의 꽃'})).toBe(true);expect(store.markLibrary('missing',{favorite:true,title:''})).toBe(false);
 store.close();store=await openStore(dir);const result=store.library({offset:0,limit:20,query:'나의 꽃',kind:'image',favorite:true});expect(result.total).toBe(1);expect(result.items[0].job.input.seed).toBe(0);expect(result.items[0].favorite).toBe(true);
 expect(store.library({offset:0,limit:20,query:'%',kind:'all',favorite:false}).total).toBe(0);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
