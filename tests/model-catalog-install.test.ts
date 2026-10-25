import {it,expect,afterEach,vi} from 'vitest';
import * as modelFiles from '../server/models/files.js';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,mkdir,readdir,symlink} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {openStore} from '../server/store.js';import {GenerationManager} from '../server/generation/manager.js';import {ModelManager} from '../server/models/manager.js';
import {catalogFiles,selectCatalogFiles} from '../src/model-catalog.js';import {modelFolders} from '../src/models.js';import type {CatalogTransport} from '../server/models/catalog.js';
const revision='a'.repeat(40);const content=(path:string)=>Buffer.from(`fixture only: ${path}`);const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const cleanups:(()=>Promise<unknown>)[]=[];afterEach(async()=>{for(const fn of cleanups.reverse())await fn();cleanups.length=0;});
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'catalog-install-'));cleanups.push(()=>rm(dir,{recursive:true,force:true}));let store=await openStore(dir);cleanups.push(async()=>store.close());let generation=new GenerationManager(store,dir);cleanups.push(()=>generation.close());const calls:string[]=[];const control={fail:'',slow:false};
 const transport:CatalogTransport=async url=>{calls.push(url.href);if(url.pathname.startsWith('/api/')){const repo=url.pathname.split('/').slice(3,5).join('/');return {status:200,headers:{},body:Readable.from([JSON.stringify({sha:revision,siblings:catalogFiles.filter(f=>f.repo===repo).map(f=>({rfilename:f.path,size:content(f.path).length,lfs:{size:content(f.path).length,sha256:digest(content(f.path))}}))})])};}
 const path=decodeURIComponent(url.pathname.split(`/resolve/${revision}/`)[1]);if(path===control.fail)return {status:503,headers:{},body:Readable.from([])};const bytes=content(path);return {status:200,headers:{},body:control.slow?Readable.from((async function*(){yield bytes.subarray(0,1);await new Promise(r=>setTimeout(r,100));yield bytes.subarray(1);})()):Readable.from([bytes])};};
 let models=new ModelManager(store,dir,generation,transport);await models.ready();cleanups.push(()=>models.close());return {dir,store,generation,models,calls,control,reopen:async()=>{await models.close();await generation.close();store.close();store=await openStore(dir);generation=new GenerationManager(store,dir);models=new ModelManager(store,dir,generation,transport);await models.ready();return {models,store};}};
}
it('installs selected bundles once, preserves filenames and reuses shared components',async()=>{
 const {models,store,calls}=await setup();const task=models.startCatalog({featureIds:['krea-turbo','krea-raw'],confirmed:true});expect(()=>models.startCatalog({featureIds:['sdxl'],confirmed:true})).toThrow();
 await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');expect(store.listAssets()).toHaveLength(4);expect(calls.filter(u=>u.includes('/resolve/'))).toHaveLength(4);
 const status=await models.catalog();expect(status.features.filter(f=>f.ready).map(f=>f.id)).toEqual(['krea-turbo','krea-raw']);
 const again=models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>store.getModelTask(again.id)?.state).toBe('completed');expect(calls.filter(u=>u.includes('/resolve/'))).toHaveLength(4);expect(store.listAssets()).toHaveLength(4);
 for(const asset of store.listAssets())expect(await readFile(join(asset.root,asset.relativePath))).toEqual(content(catalogFiles.find(f=>f.path.endsWith(asset.fileName))!.path));
});
it('keeps completed components after failure and retry pins the original version',async()=>{
 const {models,store,control,calls}=await setup();control.fail=selectCatalogFiles(['krea-turbo'])[1].path;
 const task=models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(store.listAssets()).toHaveLength(1);
 control.fail='';const retry=models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>store.getModelTask(retry.id)?.state).toBe('completed');expect(store.listAssets()).toHaveLength(3);expect(calls.filter(u=>u.includes('/revision/')).at(-1)).toContain(revision);expect(calls.filter(u=>u.includes('/resolve/')&&u.endsWith('krea2_turbo_fp8_scaled.safetensors'))).toHaveLength(1);
 expect((await readdir(models.root())).some(n=>n.endsWith('.tmp'))).toBe(false);
});
it('cancels active transfer, cleans partial bytes and retries without overwriting finished files',async()=>{
 const {models,store,control}=await setup();control.slow=true;const task=models.startCatalog({featureIds:['sdxl'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.received).toBeGreaterThan(0);models.cancel(task.id);await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('cancelled');expect(store.listAssets()).toHaveLength(0);expect((await readdir(models.root())).some(n=>n.endsWith('.tmp'))).toBe(false);
 control.slow=false;const retry=models.startCatalog({featureIds:['sdxl'],confirmed:true});await expect.poll(()=>store.getModelTask(retry.id)?.state).toBe('completed');expect((await models.catalog()).features.find(f=>f.id==='sdxl')?.ready).toBe(true);
});
it('detects missing or modified files, repairs missing registered files and counts only the current root',async()=>{
 const {models,store,dir}=await setup();const start=()=>models.startCatalog({featureIds:['sdxl'],confirmed:true});let task=start();await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');const asset=store.listAssets()[0],path=join(asset.root,asset.relativePath);await rm(path);expect((await models.catalog()).features[0].ready).toBe(false);
 task=start();await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');expect(store.listAssets()).toHaveLength(1);expect(store.listAssets()[0].id).toBe(asset.id);
 await writeFile(path,Buffer.alloc(asset.bytes,120));task=start();await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(store.getModelTask(task.id)?.error).toMatch(/변경/);expect(await readFile(path)).toEqual(Buffer.alloc(asset.bytes,120));
 await models.setRoot(join(dir,'other-root'));expect((await models.catalog()).features[0].ready).toBe(false);expect(store.listAssets()).toHaveLength(1);
});
it('refuses unmanaged collisions and symlinked destinations before downloading weights',async()=>{
 const {models,store,calls,dir}=await setup();const file=selectCatalogFiles(['sdxl'])[0],folder=join(models.root(),modelFolders[file.kind],file.bundle);await mkdir(folder,{recursive:true});const path=join(folder,file.path);await writeFile(path,'user data');let task=models.startCatalog({featureIds:['sdxl'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(calls.filter(u=>u.includes('/resolve/'))).toHaveLength(0);expect(await readFile(path,'utf8')).toBe('user data');
 await rm(folder,{recursive:true});const outside=join(dir,'outside');await mkdir(outside);await symlink(outside,folder,process.platform==='win32'?'junction':'dir');task=models.startCatalog({featureIds:['sdxl'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(await readdir(outside)).toEqual([]);expect(calls.filter(u=>u.includes('/resolve/'))).toHaveLength(0);
});

it('retains completed components across database reopen and resumes missing files',async()=>{
 const context=await setup();context.control.fail=selectCatalogFiles(['krea-turbo'])[1].path;const task=context.models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>context.store.getModelTask(task.id)?.state).toBe('failed');const original=context.store.listAssets()[0];const {models,store}=await context.reopen();expect(store.listAssets()).toHaveLength(1);context.control.fail='';const retry=models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>store.getModelTask(retry.id)?.state).toBe('completed');expect(store.listAssets().some(a=>a.id===original.id)).toBe(true);expect((await models.catalog()).features.find(f=>f.id==='krea-turbo')?.ready).toBe(true);
});
it('fails before weight transfer when total space is unavailable',async()=>{
 const {models,store,calls}=await setup();const space=vi.spyOn(modelFiles,'ensureSpace').mockRejectedValue(new Error('디스크 여유 공간이 부족합니다.'));
 try{const task=models.startCatalog({featureIds:['sdxl'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(store.getModelTask(task.id)?.error).toContain('여유 공간');expect(calls.filter(u=>u.includes('/resolve/'))).toHaveLength(0);expect(store.listAssets()).toHaveLength(0);}finally{space.mockRestore();}
});
it('refuses mixed revisions and rolls back an unregistered file on database failure',async()=>{
 const {models,store}=await setup();const originalPut=store.putAsset;store.putAsset=()=>{throw new Error('DB full');};let task=models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(store.listAssets()).toHaveLength(0);store.putAsset=originalPut;
 task=models.startCatalog({featureIds:['krea-turbo'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');const asset=store.listAssets()[0];store.deleteAsset(asset.id);store.putAsset({...asset,revision:'c'.repeat(40),sourceUrl:asset.sourceUrl.replace(revision,'c'.repeat(40))});expect((await models.catalog()).features.find(f=>f.id==='krea-turbo')?.ready).toBe(false);
 task=models.startCatalog({featureIds:['krea-raw'],confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(store.getModelTask(task.id)?.error).toContain('서로 다른');
});
