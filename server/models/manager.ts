import {featureDownloadSchema,selectCatalogFiles} from '../../src/model-catalog.js';
import {resolveCatalogFiles,type CatalogTransport} from './catalog.js';
import {catalogRelativePath,inspectCatalog} from './catalog-state.js';
import {httpsResponse} from './network.js';
import {randomUUID} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {rm,lstat} from 'node:fs/promises';
import {modelFolders,importModelSchema,downloadModelSchema,nodeInstallSchema,type DownloadModelInput,type NodeInstallInput,type ImportModelInput,type ModelTask,type ModelRemoval,type InstalledAsset} from '../../src/models.js';
import type {openStore} from '../store.js';
import {GenerationManager,GenerationError} from '../generation/manager.js';
import {ComfyClient} from '../generation/client.js';
import {noSymlinks,importFile,hashFile,scanModels,ensureSpace} from './files.js';
import {downloadAsset} from './download.js';
import {diagnoseAssets,exportPaths} from './diagnostics.js';
import {stagePack,activatePack,removePack,packPaths} from './nodes.js';
export type ModelStore=Awaited<ReturnType<typeof openStore>>;
export class ModelManager {
 private abort?:AbortController;private task?:Promise<void>;private active?:ModelTask;private stopped=false;private failedTasks=new Map<string,ModelTask>();private setupWarnings:string[]=[];
 constructor(readonly store:ModelStore,readonly dataDir:string,readonly generation:GenerationManager,private readonly transport:CatalogTransport=httpsResponse){}
 root(){return this.store.getModelRoot()??resolve(this.dataDir,'models');}
 async ready(){this.setupWarnings=[];for(const path of [this.root(),join(this.dataDir,'custom_nodes')]){try{await noSymlinks(path,true);}catch{this.setupWarnings.push(`폴더를 사용할 수 없습니다. 경로와 권한을 확인하거나 새 관리 경로를 선택하세요: ${path}`);}}for(const task of this.store.listModelTasks())if(task.state==='running'){
  let cleanup='';try{if(task.operation==='stage-node'){const path=join(this.dataDir,'node-staging',task.id);await noSymlinks(path);await rm(path,{recursive:true,force:true});}else if(task.root){await noSymlinks(task.root);await rm(join(task.root,`.install-${task.id}.tmp`),{force:true});}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')cleanup=' 임시 파일 정리는 경로 권한을 확인한 뒤 수동으로 진행하세요.';}
  this.store.putModelTask({...task,state:'failed',error:'앱 종료로 중단되었습니다. 자동 재시작하지 않습니다.'+cleanup,updatedAt:new Date().toISOString()});}
 for(const removal of this.store.listModelRemovals()){let release:(()=>void)|undefined;try{release=this.generation.acquireMaintenance();await this.engineIdle(AbortSignal.timeout(10000));await this.finishRemoval(removal);}catch{/* Retain durable intent and show a retry diagnostic; startup remains available. */}finally{release?.();}}}
 async engineIdle(signal:AbortSignal){try{const queue=await new ComfyClient(this.store.getSettings().comfyUrl,signal).queue();if(queue.length)throw new GenerationError(409,'ComfyUI에 다른 작업이 있습니다.');}catch(error){signal.throwIfAborted();const cause=error instanceof TypeError?error.cause:undefined;if(cause&&typeof cause==='object'&&'code' in cause&&cause.code==='ECONNREFUSED')return;throw error;}}
 private update(task:ModelTask,patch:Partial<ModelTask>){Object.assign(task,patch,{updatedAt:new Date().toISOString()});this.store.putModelTask(task);}
 start(operation:ModelTask['operation'],name:string,total:number|null,work:(signal:AbortSignal,progress:(bytes:number)=>void,taskId:string,detail:(patch:Pick<Partial<ModelTask>,'currentFile'|'total'>)=>void)=>Promise<string|undefined>):ModelTask {
  this.assertSettled();if(this.stopped||this.active)throw new GenerationError(409,'다른 설치 작업이 진행 중입니다.');const release=this.generation.acquireMaintenance();const now=new Date().toISOString();const task:ModelTask={id:randomUUID(),root:this.root(),operation,name,total,received:0,state:'running',error:null,createdAt:now,updatedAt:now};
  try{this.store.putModelTask(task);}catch(error){release();throw error;}this.active=task;this.abort=new AbortController();const signal=this.abort.signal;let lastWrite=0;
  this.task=(async()=>{try{await this.engineIdle(signal);const assetId=await work(signal,bytes=>{task.received=bytes;if(Date.now()-lastWrite>250){lastWrite=Date.now();this.update(task,{});}},task.id,patch=>this.update(task,patch));this.update(task,{state:'completed',assetId});}catch(error){const patch:Partial<ModelTask>={state:signal.aborted&&!this.stopped?'cancelled':'failed',error:signal.aborted?'작업이 중단되었습니다.':error instanceof Error?error.message:'설치 실패'};try{this.update(task,patch);}catch{Object.assign(task,patch,{error:`${patch.error} (설치 기록 저장 실패)`,updatedAt:new Date().toISOString()});this.failedTasks.set(task.id,{...task});}}finally{this.active=undefined;release();}})();return task;
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
 async catalog(){return (await inspectCatalog(this.root(),this.store.listAssets())).status;}
 startCatalog(raw:unknown){
  const input=featureDownloadSchema.parse(raw),files=selectCatalogFiles(input.featureIds),root=this.root();
  return this.start('download','기능별 모델 다운로드',null,async(signal,progress,taskId,detail)=>{
   detail({currentFile:'모델 파일과 버전 확인 중'});const state=await inspectCatalog(root,this.store.listAssets());
   for(const file of files)if(state.conflicts.has(file.repo))throw new Error('서로 다른 모델 버전이 섞여 있습니다. 해당 묶음을 삭제한 뒤 다시 다운로드하세요.');
   const missing=files.filter(file=>!state.installed.has(file.id));
   for(const file of files){
    signal.throwIfAborted();const asset=state.installed.get(file.id);const path=join(root,catalogRelativePath(file));
    if(asset){detail({currentFile:`기존 파일 확인: ${asset.fileName}`});const hash=await hashFile(path,signal);if(hash.sha256!==asset.sha256||hash.bytes!==asset.bytes)throw new Error(`설치 후 변경된 파일입니다: ${asset.fileName}. 표시된 경로의 파일을 백업해 다른 위치로 옮긴 후 다시 다운로드하세요.`);}
    else{await noSymlinks(dirname(path),true);try{await lstat(path);throw new Error(`기존 파일을 덮어쓰지 않습니다: ${path}. 해당 파일을 백업해 다른 위치로 옮긴 후 다시 다운로드하세요.`);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
   }
   if(!missing.length){detail({total:0,currentFile:'선택한 모델 파일이 이미 준비되어 있습니다.'});return undefined;}
   detail({currentFile:'공식 저장소에서 다운로드 정보 확인 중'});
   const resolved=await resolveCatalogFiles(missing,state.revisions,signal,this.transport);
   await noSymlinks(root,true);const total=resolved.reduce((sum,item)=>sum+item.input.bytes,0);await ensureSpace(root,total);detail({total});let received=0;
   for(const {file,input:download} of resolved){
    signal.throwIfAborted();detail({currentFile:download.manifest.fileName});const path=catalogRelativePath(file),existing=state.records.get(file.id);
    if(existing&&(existing.sha256!==download.sha256||existing.bytes!==download.bytes))throw new Error(`등록된 모델과 제공자 해시가 다릅니다: ${download.manifest.fileName}`);
    const saved=await downloadAsset(download.manifest.sourceUrl,root,path,download.bytes,download.sha256,signal,bytes=>progress(received+bytes),taskId,this.transport);
    const id=existing?.id??randomUUID();
    try{if(!existing)this.store.putAsset({...download.manifest,id,root,relativePath:path,sha256:saved.sha256,bytes:saved.bytes,method:'download',installedAt:new Date().toISOString()});}catch(error){await rm(saved.destination,{force:true});throw error;}
    received+=saved.bytes;progress(received);
   }
   detail({currentFile:'선택한 모델 파일 다운로드 완료'});return undefined;
  });
 }
 startNode(raw:NodeInstallInput){const input=nodeInstallSchema.parse(raw);return this.start('stage-node',input.name,null,async(signal,_progress,taskId)=>{const pack=await stagePack(input,this.dataDir,taskId,signal);try{this.store.putNodePack(pack);}catch(error){await rm(pack.root,{recursive:true,force:true});throw error;}return pack.id;});}
 private assertSettled(){if(this.store.listModelRemovals().length)throw new GenerationError(409,'미완료 삭제·비활성화 기록이 있습니다. 같은 작업을 다시 요청하거나 앱을 재시작하세요.');}
 private async finishRemoval(removal:ModelRemoval){
  if(removal.kind==='asset'){const asset=removal.asset;await noSymlinks(asset.root);const path=join(asset.root,asset.relativePath);let exists=true;try{await lstat(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')exists=false;else throw error;}if(exists){const hash=await hashFile(path);if(hash.sha256!==asset.sha256||hash.bytes!==asset.bytes)throw new GenerationError(409,'설치 후 변경된 파일은 삭제하지 않습니다.');await rm(path);}}
  else await removePack(removal.pack,removal.action==='remove',true);
  this.store.finishModelRemoval(removal);
 }
 async changeNode(id:string,action:'activate'|'deactivate'|'remove',acknowledged:boolean){if(!acknowledged)throw new GenerationError(400,'노드 코드 실행·의존성과 재시작을 확인하세요.');const release=this.generation.acquireMaintenance();try{
  await this.engineIdle(AbortSignal.timeout(10000));const pending=this.store.listModelRemovals().find(r=>r.kind==='node'&&r.pack.id===id);if(pending){if(pending.kind!=='node'||pending.action!==action)throw new GenerationError(409,'미완료 노드 변경과 같은 작업을 다시 요청하세요.');await this.finishRemoval(pending);return {restartRequired:true};}this.assertSettled();
  const pack=this.store.listNodePacks().find(n=>n.id===id);if(!pack)throw new GenerationError(404,'노드가 없습니다.');if(action==='activate'){const active=await activatePack(pack,this.dataDir,true);try{this.store.putNodePack(active);}catch(error){await removePack(active,false);throw error;}return active;}
  await packPaths(pack,action==='remove');const removal:ModelRemoval={id:randomUUID(),kind:'node',pack,action};this.store.putModelRemoval(removal);await this.finishRemoval(removal);return {restartRequired:true};
 }finally{release();}}
 cancel(id:string){if(this.active?.id!==id)throw new GenerationError(409,'실행 중인 설치 작업이 아닙니다.');this.abort?.abort();return {requested:true};}
 async setRoot(root:string){const release=this.generation.acquireMaintenance();try{await this.engineIdle(AbortSignal.timeout(10000));const canonical=await noSymlinks(root,true);this.store.setModelRoot(canonical);this.setupWarnings=this.setupWarnings.filter(w=>!w.includes('새 관리 경로'));return {root:canonical};}finally{release();}}
 async inventory(){const assets=this.store.listAssets();const scan=await scanModels([this.root(),...assets.map(a=>a.root)],new Set(assets.map(a=>resolve(a.root,a.relativePath))));const pending=this.store.listModelRemovals();return {root:this.root(),assets,tasks:this.store.listModelTasks().map(task=>this.failedTasks.get(task.id)??task),nodes:this.store.listNodePacks(),files:scan.files,warnings:[...this.setupWarnings,...scan.warnings,...pending.map(r=>`미완료 ${r.kind==='asset'?'모델 삭제':r.action==='remove'?'노드 삭제':'노드 비활성화'}: ${r.kind==='asset'?r.asset.name:r.pack.name}. 디스크·경로를 확인하고 같은 작업을 다시 요청하거나 앱을 재시작하세요.`)]};}
 async diagnostics(){return diagnoseAssets(this.store);}
 pathsConfig(){return exportPaths(this.root(),this.store.listAssets(),join(this.dataDir,'custom_nodes'));}
 async freeMemory(){const release=this.generation.acquireMaintenance();try{const signal=AbortSignal.timeout(10000);await this.engineIdle(signal);const response=await new ComfyClient(this.store.getSettings().comfyUrl,signal).request('/free',{unload_models:true,free_memory:true});await response.body?.cancel();return {requested:true,message:'비동기 메모리 해제 요청을 접수했습니다. 실제 여유 VRAM은 상태 새로고침으로 확인하세요.'};}finally{release();}}
 async remove(id:string,confirmation:{confirmed:boolean;acknowledgedReferences:boolean}){if(!confirmation.confirmed)throw new GenerationError(400,'삭제를 명시적으로 확인하세요.');const release=this.generation.acquireMaintenance();try{
  const pending=this.store.listModelRemovals().find(r=>r.kind==='asset'&&r.asset.id===id);if(pending){await this.engineIdle(AbortSignal.timeout(10000));await this.finishRemoval(pending);return {deleted:true};}this.assertSettled();
  const asset=this.store.listAssets().find(a=>a.id===id);if(!asset)throw new GenerationError(404,'관리하는 모델이 없습니다.');const dependents=this.store.listAssets().filter(a=>a.requiredAssets.includes(id));if(dependents.length)throw new GenerationError(409,'다른 모델의 필수 의존성입니다.');if(this.store.modelReferences(asset)&&!confirmation.acknowledgedReferences)throw new GenerationError(409,'과거 작업이 참조합니다. 삭제 후 재생성이 불가능할 수 있음을 확인하세요.');
  await this.engineIdle(AbortSignal.timeout(10000));const path=join(asset.root,asset.relativePath);const hash=await hashFile(path);if(hash.sha256!==asset.sha256||hash.bytes!==asset.bytes)throw new GenerationError(409,'설치 후 변경된 파일은 삭제하지 않습니다.');const removal:ModelRemoval={id:randomUUID(),kind:'asset',asset};this.store.putModelRemoval(removal);await this.finishRemoval(removal);return {deleted:true};
 }finally{release();}}
 async close(){this.stopped=true;this.abort?.abort();await this.task;}
}
