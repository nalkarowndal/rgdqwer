import {it,expect} from 'vitest';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from '../server/store.js';import {GenerationManager} from '../server/generation/manager.js';import {ModelManager} from '../server/models/manager.js';import {simulatedComfy} from './fixtures/comfy.js';import {modelManifestSchema} from '../src/models.js';
it('exports old and new paths, diagnoses dependencies and hands an imported model to a simulated engine',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'model-int-')),engine=await simulatedComfy();const store=await openStore(dir);store.saveSettings({...store.getSettings(),comfyUrl:engine.url});const generation=new GenerationManager(store,dir),models=new ModelManager(store,dir,generation);await models.ready();
 try{const source=join(dir,'source.safetensors');await writeFile(source,'fixture only');const manifest=modelManifestSchema.parse({name:'fixture',kind:'checkpoint',fileName:'fixture.safetensors',family:'sd15',license:'CC0',requiredNodes:['MissingNode']});const task=models.startImport({manifest,sourcePath:source,confirmed:true});await expect.poll(()=>store.getModelTask(task.id)?.state).toBe('completed');const asset=store.listAssets()[0];
 const before=await models.diagnostics();expect(before[0].issues.join(' ')).toContain('MissingNode');expect(before[0].engineVisible).toBe(false);
 const name=asset.relativePath.replaceAll('\\','/').split('/').slice(1).join('/');engine.nodes.CheckpointLoaderSimple={input:{required:{ckpt_name:[[name]]}}};expect((await models.diagnostics())[0].engineVisible).toBe(true);
 const job=generation.create({profile:'sd15',checkpoint:name,prompt:'fixture',negative:'',width:512,height:512,seed:1,steps:1,cfg:1});await expect.poll(()=>store.getJob(job.id)?.state,{timeout:10000}).toBe('completed');
 await expect(models.remove(asset.id,{confirmed:true,acknowledgedReferences:false})).rejects.toThrow(/참조/);
 await models.setRoot(join(dir,'new-root'));const config=models.pathsConfig();expect(config).toContain(asset.root.replaceAll('\\','/'));expect(config).toContain('new-root');
 engine.control.externalBusy=true;await expect(models.freeMemory()).rejects.toThrow();expect(engine.calls.filter(c=>c.path==='/free')).toHaveLength(0);engine.control.externalBusy=false;
 expect(await models.freeMemory()).toEqual({requested:true,message:expect.stringContaining('비동기')});expect(engine.calls.find(c=>c.path==='/free')?.body).toEqual({unload_models:true,free_memory:true});
 }finally{await models.close();await generation.close();store.close();await engine.close();await rm(dir,{recursive:true,force:true});}
});
