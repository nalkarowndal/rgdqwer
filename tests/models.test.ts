import {it,expect,afterEach} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,mkdir,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {modelManifestSchema} from '../src/models.js';
import {openStore} from '../server/store.js';
import {GenerationManager} from '../server/generation/manager.js';
import {ModelManager} from '../server/models/manager.js';
const cleanup:(()=>Promise<unknown>)[]=[];afterEach(async()=>{for(const f of cleanup.reverse())await f();cleanup.length=0;});
export const modelFixture=()=>({name:'Test SDXL',kind:'checkpoint' as const,family:'sdxl',fileName:'model.safetensors',bundle:'',sourceUrl:'https://example.com/model.safetensors',revision:'test',license:'CC0',requiredAssets:[],requiredNodes:[],vramGiB:8});
async function setup(){const dir=await mkdtemp(join(tmpdir(),'models-'));cleanup.push(()=>rm(dir,{recursive:true,force:true}));const store=await openStore(dir);cleanup.push(async()=>store.close());const generation=new GenerationManager(store,dir);cleanup.push(()=>generation.close());const models=new ModelManager(store,dir,generation);await models.ready();cleanup.push(()=>models.close());return {dir,store,generation,models};}
it('validates portable filenames, metadata and explicit compatibility',()=>{
 expect(modelManifestSchema.safeParse(modelFixture()).success).toBe(true);
 for(const fileName of ['../bad.pt','NUL.pt','a:b.pt','x.py','x.','..','a\\b.pt'])expect(modelManifestSchema.safeParse({...modelFixture(),fileName}).success).toBe(false);
 expect(modelManifestSchema.safeParse({...modelFixture(),vramGiB:-1}).success).toBe(false);
});
it('streams a local import, records SHA256 and refuses changed-file deletion',async()=>{
 const {dir,models,store}=await setup();const source=join(dir,'source.safetensors');await writeFile(source,'fixture model bytes');
 const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');
 const [asset]=store.listAssets();expect(asset.sha256).toBe(createHash('sha256').update('fixture model bytes').digest('hex'));expect(await readFile(join(asset.root,asset.relativePath),'utf8')).toBe('fixture model bytes');
 await writeFile(join(asset.root,asset.relativePath),'changed by user');await expect(models.remove(asset.id,{confirmed:true,acknowledgedReferences:true})).rejects.toThrow(/변경/);
 expect(await readFile(join(asset.root,asset.relativePath),'utf8')).toBe('changed by user');
});
it('preserves original files, excludes generation during maintenance and retains old-root assets',async()=>{
 const {dir,models,store,generation}=await setup();const source=join(dir,'source.safetensors');await writeFile(source,'original');
 const release=generation.acquireMaintenance();expect(()=>models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true})).toThrow();release();
 const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});expect(()=>generation.create({profile:'sd15',checkpoint:'test.safetensors',prompt:'x',negative:'',width:512,height:512,seed:0,steps:1,cfg:1})).toThrow();await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');
 const [asset]=store.listAssets();await models.setRoot(join(dir,'new-root'));expect(store.listAssets()[0].root).toBe(asset.root);
 await models.remove(asset.id,{confirmed:true,acknowledgedReferences:true});expect(await readFile(source,'utf8')).toBe('original');expect(store.listAssets()).toEqual([]);
});
it('does not follow symlinked import or destination directories',async()=>{
 const {dir,models,store}=await setup();const source=join(dir,'source.safetensors');await writeFile(source,'original');const root=models.root();const outside=join(dir,'outside');await mkdir(outside);await symlink(outside,join(root,'checkpoints'),process.platform==='win32'?'junction':'dir');
 const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('failed');expect(await readdir(outside)).toEqual([]);
});
it('recovers interrupted installs and removes only their recorded partial files',async()=>{
 const {models,store}=await setup();const id='11111111-1111-4111-8111-111111111111';const root=models.root();await writeFile(join(root,`.install-${id}.tmp`),'partial');await writeFile(join(root,'.unrelated.tmp'),'keep');
 store.putModelTask({id,operation:'import',name:'interrupted',root,state:'running',received:7,total:20,error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 await models.ready();expect(store.getModelTask(id)?.state).toBe('failed');expect(await readdir(root)).toEqual(['.unrelated.tmp']);
});
it('recovers missing old roots without blocking application startup',async()=>{
 const {dir,models,store}=await setup();store.putModelTask({id:'11111111-1111-4111-8111-111111111111',operation:'import',name:'interrupted',root:join(dir,'removed-root'),state:'running',received:1,total:10,error:null,createdAt:'',updatedAt:''});await models.ready();expect(store.listModelTasks()[0].state).toBe('failed');
});
it('refuses maintenance when a reachable engine returns a malformed queue',async()=>{
 const {createServer}=await import('node:http');const server=createServer((_req,res)=>res.end('{}'));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});const {models,store}=await setup();store.saveSettings({...store.getSettings(),comfyUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`});await expect(models.engineIdle(new AbortController().signal)).rejects.toThrow();
});
it('handles a persistent task-store failure without an unhandled rejection and releases maintenance',async()=>{
 const {dir,models,store,generation}=await setup();const source=join(dir,'source.safetensors');await writeFile(source,'failure fixture');const original=store.putModelTask;let writes=0;store.putModelTask=task=>{if(++writes>1)throw new Error('disk full');original(task);};const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});
 await expect.poll(async()=>(await models.inventory()).tasks.find(t=>t.id===task.id)?.state).toBe('failed');await models.close();const release=generation.acquireMaintenance();release();expect(store.listAssets()).toEqual([]);store.putModelTask=original;
});
it('durably reconciles deletion and deactivation after final metadata persistence fails',async()=>{
 const {models,store,dir}=await setup();const source=join(dir,'source.pt');await writeFile(source,'fixture');const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');const asset=store.listAssets()[0];
 // Fault after the old code's destructive filesystem step; the new durable finalizer is the equivalent boundary.
 const originalDelete=store.deleteAsset;store.deleteAsset=()=>{throw new Error('disk full');};const finalize=store.finishModelRemoval;store.finishModelRemoval=()=>{throw new Error('disk full');};
 await expect(models.remove(asset.id,{confirmed:true,acknowledgedReferences:true})).rejects.toThrow();store.deleteAsset=originalDelete;store.finishModelRemoval=finalize;
 expect(store.listModelRemovals()).toHaveLength(1);await models.ready();expect(store.listModelRemovals()).toEqual([]);expect(store.listAssets()).toEqual([]);expect(await readFile(source,'utf8')).toBe('fixture');
 const {inspectTree}=await import('../server/models/nodes.js');const root=join(dir,'node-staging','fixture');await mkdir(root,{recursive:true});await writeFile(join(root,'__init__.py'),'pass');store.putNodePack({...await inspectTree(root),id:'fixture',name:'Fixture',repository:'https://github.com/test/test',commit:'a'.repeat(40),root,installedAt:''});await models.changeNode('fixture','activate',true);
 const originalPut=store.putNodePack;store.putNodePack=()=>{throw new Error('disk full');};store.finishModelRemoval=()=>{throw new Error('disk full');};await expect(models.changeNode('fixture','deactivate',true)).rejects.toThrow();store.putNodePack=originalPut;store.finishModelRemoval=finalize;
 await models.ready();expect(store.listNodePacks()[0].activePath).toBeUndefined();await models.changeNode('fixture','activate',true);expect(store.listNodePacks()[0].activePath).toBeTruthy();await models.changeNode('fixture','remove',true);expect(store.listNodePacks()).toEqual([]);
});
it('starts the whole API with an unavailable configured model root and allows recovery',async()=>{
 const {createApp}=await import('../server/app.js');const dir=await mkdtemp(join(tmpdir(),'bad-root-'));cleanup.push(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'not-a-directory');await writeFile(file,'keep');const store=await openStore(dir);store.setModelRoot(join(file,'models'));store.close();const app=await createApp({dataDir:dir});cleanup.push(()=>app.close());const host={host:'127.0.0.1'};const token=(await app.inject({url:'/api/session',headers:host})).json().token;const headers={...host,authorization:`Bearer ${token}`};expect((await app.inject({url:'/api/library',headers})).statusCode).toBe(200);expect((await app.inject({url:'/api/models',headers})).json().warnings.length).toBeGreaterThan(0);expect((await app.inject({url:'/api/models/root',method:'PUT',headers,payload:{root:join(dir,'new-models'),confirmed:true}})).statusCode).toBe(200);expect(await readFile(file,'utf8')).toBe('keep');
});
it('does not delete a file when durable removal intent cannot be saved',async()=>{
 const {models,store,dir}=await setup();const source=join(dir,'source.pt');await writeFile(source,'fixture');const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');const asset=store.listAssets()[0];const original=store.putModelRemoval;store.putModelRemoval=()=>{throw new Error('disk full');};await expect(models.remove(asset.id,{confirmed:true,acknowledgedReferences:true})).rejects.toThrow('disk full');expect(await readFile(join(asset.root,asset.relativePath),'utf8')).toBe('fixture');expect(store.listModelRemovals()).toEqual([]);store.putModelRemoval=original;
});
it('reconciles durable deletion intent after closing and reopening the database',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'removal-restart-'));let store=await openStore(dir),generation=new GenerationManager(store,dir),models=new ModelManager(store,dir,generation);let opened=true;
 try{await models.ready();const source=join(dir,'source.pt');await writeFile(source,'restart fixture');const task=models.startImport({manifest:modelFixture(),sourcePath:source,confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');const asset=store.listAssets()[0];store.finishModelRemoval=()=>{throw new Error('disk full');};await expect(models.remove(asset.id,{confirmed:true,acknowledgedReferences:true})).rejects.toThrow('disk full');expect(()=>generation.create({profile:'sd15',checkpoint:'fixture',prompt:'x',negative:'',width:512,height:512,seed:1,steps:1,cfg:1})).toThrow(/복구/);
 await models.close();await generation.close();store.close();opened=false;store=await openStore(dir);opened=true;generation=new GenerationManager(store,dir);models=new ModelManager(store,dir,generation);expect(store.listModelRemovals()).toHaveLength(1);await models.ready();expect(store.listModelRemovals()).toEqual([]);expect(store.listAssets()).toEqual([]);
 }finally{if(opened){await models.close();await generation.close();store.close();}await rm(dir,{recursive:true,force:true});}
});
