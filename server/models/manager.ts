import {randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {rm} from 'node:fs/promises';
import {modelFolders,importModelSchema,downloadModelSchema,nodeInstallSchema,type DownloadModelInput,type NodeInstallInput,type ImportModelInput,type ModelTask,type InstalledAsset} from '../../src/models.js';
import type {openStore} from '../store.js';
import {GenerationManager,GenerationError} from '../generation/manager.js';
import {ComfyClient,EngineHttpError} from '../generation/client.js';
import {noSymlinks,importFile,hashFile,scanModels} from './files.js';
import {downloadAsset} from './download.js';
import {stagePack,activatePack,removePack} from './nodes.js';
export type ModelStore=Awaited<ReturnType<typeof openStore>>;
export class ModelManager {
 private abort?:AbortController;private task?:Promise<void>;private active?:ModelTask;private stopped=false;
 constructor(readonly store:ModelStore,readonly dataDir:string,readonly generation:GenerationManager){}
 root(){return this.store.getModelRoot()??resolve(this.dataDir,'models');}
 async ready(){await noSymlinks(this.root(),true);for(const task of this.store.listModelTasks())if(task.state==='running'){if(task.root){await noSymlinks(task.root);await rm(join(task.root,`.install-${task.id}.tmp`),{force:true});}this.store.putModelTask({...task,state:'failed',error:'앱 종료로 중단되었습니다. 자동 재시작하지 않습니다.',updatedAt:new Date().toISOString()});}}
 async engineIdle(signal:AbortSignal){try{const queue=await new ComfyClient(this.store.getSettings().comfyUrl,signal).queue();if(queue.length)throw new GenerationError(409,'ComfyUI에 다른 작업이 있습니다.');}catch(error){if(error instanceof GenerationError||error instanceof EngineHttpError)throw error;signal.throwIfAborted();/* Unreachable standalone Comfy does not block local maintenance. */}}
 private update(task:ModelTask,patch:Partial<ModelTask>){Object.assign(task,patch,{updatedAt:new Date().toISOString()});this.store.putModelTask(task);}
 start(operation:ModelTask['operation'],name:string,total:number|null,work:(signal:AbortSignal,progress:(bytes:number)=>void,taskId:string)=>Promise<string|undefined>):ModelTask {
  if(this.stopped||this.active)throw new GenerationError(409,'다른 설치 작업이 진행 중입니다.');const release=this.generation.acquireMaintenance();const now=new Date().toISOString();const task:ModelTask={id:randomUUID(),root:this.root(),operation,name,total,received:0,state:'running',error:null,createdAt:now,updatedAt:now};
  try{this.store.putModelTask(task);}catch(error){release();throw error;}this.active=task;this.abort=new AbortController();const signal=this.abort.signal;let lastWrite=0;
  this.task=(async()=>{try{await this.engineIdle(signal);const assetId=await work(signal,bytes=>{task.received=bytes;if(Date.now()-lastWrite>250){lastWrite=Date.now();this.update(task,{});}},task.id);this.update(task,{state:'completed',assetId});}catch(error){this.update(task,{state:signal.aborted&&!this.stopped?'cancelled':'failed',error:signal.aborted?'작업이 중단되었습니다.':error instanceof Error?error.message:'설치 실패'});}finally{this.active=undefined;release();}})();return task;
 }
 startImport(raw:ImportModelInput){const input=importModelSchema.parse(raw);const root=this.root();return this.start('import',input.manifest.name,null,async(signal,progress,taskId)=>{
  const id=randomUUID();const relativePath=join(modelFolders[input.manifest.kind],input.manifest.bundle,`${id}-${input.manifest.fileName}`);
  // Bundles keep provider filenames so multi-file voice/analysis loaders can find them.
  const path=input.manifest.bundle?join(modelFolders[input.manifest.kind],input.manifest.bundle,input.manifest.fileName):relativePath;
  const saved=await importFile(input.sourcePath,root,path,signal,progress,taskId);const asset:InstalledAsset={...input.manifest,id,root,relativePath:path,sha256:saved.sha256,bytes:saved.bytes,method:'import',installedAt:new Date().toISOString()};
  try{this.store.putAsset(asset);}catch(error){await rm(saved.destination,{force:true});throw error;}return id;
 });}
 startDownload(raw:DownloadModelInput){const input=downloadModelSchema.parse(raw),root=this.root();return this.start('download',input.manifest.name,input.bytes,async(signal,progress,taskId)=>{
  const id=randomUUID(),path=join(modelFolders[input.manifest.kind],input.manifest.bundle,input.manifest.bundle?input.manifest.fileName:`${id}-${input.manifest.fileName}`);
  const saved=await downloadAsset(input.manifest.sourceUrl,root,path,input.bytes,input.sha256,signal,progress,taskId);
  try{this.store.putAsset({...input.manifest,id,root,relativePath:path,sha256:saved.sha256,bytes:saved.bytes,method:'download',installedAt:new Date().toISOString()});}catch(error){await rm(saved.destination,{force:true});throw error;}return id;
 });}
 startNode(raw:NodeInstallInput){const input=nodeInstallSchema.parse(raw);return this.start('stage-node',input.name,null,async(signal,_progress,taskId)=>{const pack=await stagePack(input,this.dataDir,taskId,signal);try{this.store.putNodePack(pack);}catch(error){await rm(pack.root,{recursive:true,force:true});throw error;}return pack.id;});}
 async changeNode(id:string,action:'activate'|'deactivate'|'remove',acknowledged:boolean){if(!acknowledged)throw new GenerationError(400,'노드 코드 실행·의존성과 재시작을 확인하세요.');const release=this.generation.acquireMaintenance();try{await this.engineIdle(AbortSignal.timeout(10000));const pack=this.store.listNodePacks().find(n=>n.id===id);if(!pack)throw new GenerationError(404,'노드가 없습니다.');if(action==='activate'){const active=await activatePack(pack,this.dataDir,true);try{this.store.putNodePack(active);}catch(error){await removePack(active,false);throw error;}return active;}const next=await removePack(pack,action==='remove');if(action==='remove')this.store.deleteNodePack(id);else this.store.putNodePack(next);return {restartRequired:true};}finally{release();}}
 cancel(id:string){if(this.active?.id!==id)throw new GenerationError(409,'실행 중인 설치 작업이 아닙니다.');this.abort?.abort();return {requested:true};}
 async setRoot(root:string){const release=this.generation.acquireMaintenance();try{await this.engineIdle(AbortSignal.timeout(10000));const canonical=await noSymlinks(root,true);this.store.setModelRoot(canonical);return {root:canonical};}finally{release();}}
 async inventory(){const assets=this.store.listAssets();return {root:this.root(),assets,tasks:this.store.listModelTasks(),nodes:this.store.listNodePacks(),...await scanModels([this.root(),...assets.map(a=>a.root)],new Set(assets.map(a=>resolve(a.root,a.relativePath))))};}
 async remove(id:string,confirmation:{confirmed:boolean;acknowledgedReferences:boolean}){if(!confirmation.confirmed)throw new GenerationError(400,'삭제를 명시적으로 확인하세요.');const release=this.generation.acquireMaintenance();try{
  const asset=this.store.listAssets().find(a=>a.id===id);if(!asset)throw new GenerationError(404,'관리하는 모델이 없습니다.');const dependents=this.store.listAssets().filter(a=>a.requiredAssets.includes(id));if(dependents.length)throw new GenerationError(409,'다른 모델의 필수 의존성입니다.');if(this.store.modelReferences(asset)&&!confirmation.acknowledgedReferences)throw new GenerationError(409,'과거 작업이 참조합니다. 삭제 후 재생성이 불가능할 수 있음을 확인하세요.');
  await this.engineIdle(AbortSignal.timeout(10000));const path=join(asset.root,asset.relativePath);const hash=await hashFile(path);if(hash.sha256!==asset.sha256||hash.bytes!==asset.bytes)throw new GenerationError(409,'설치 후 변경된 파일은 삭제하지 않습니다.');await rm(path);this.store.deleteAsset(id);return {deleted:true};
 }finally{release();}}
 async close(){this.stopped=true;this.abort?.abort();await this.task;}
}
