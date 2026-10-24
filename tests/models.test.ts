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
