import {lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {catalogFiles,modelFeatures,type CatalogFile,type CatalogStatus,type CatalogFileStatus} from '../../src/model-catalog.js';
import {modelFolders,type InstalledAsset} from '../../src/models.js';
import {catalogUrl} from './catalog.js';
import {noSymlinks} from './files.js';
export const catalogRelativePath=(file:CatalogFile)=>join(modelFolders[file.kind],file.bundle,file.path.split('/').pop()!);
export async function inspectCatalog(root:string,assets:InstalledAsset[]){
 const records=new Map<string,InstalledAsset>();const installed=new Map<string,InstalledAsset>();const revisions:Record<string,string>={};const conflicts=new Set<string>();
 for(const file of catalogFiles){
  const matches=assets.filter(a=>resolve(a.root)===resolve(root)&&a.relativePath===catalogRelativePath(file)&&a.bundle===file.bundle&&a.kind===file.kind&&a.family===file.family&&/^[a-f0-9]{40}$/.test(a.revision)&&a.sourceUrl===catalogUrl(file,a.revision));
  if(matches.length>1)conflicts.add(file.repo);
  const asset=matches[0];if(!asset)continue;records.set(file.id,asset);if(revisions[file.repo]&&revisions[file.repo]!==asset.revision)conflicts.add(file.repo);revisions[file.repo]=asset.revision;
 }
 const files=new Map<string,CatalogFileStatus>();
 for(const file of catalogFiles){const asset=records.get(file.id),path=join(root,catalogRelativePath(file));let issue:string|undefined;
  if(asset){try{await noSymlinks(path);const info=await lstat(path);if(!info.isFile()||info.size!==asset.bytes)issue='파일 크기나 형식이 변경되었습니다. 이 경로의 파일을 백업해 다른 위치로 옮긴 후 기능 다운로드를 다시 시작하세요.';else installed.set(file.id,asset);}catch{issue='파일을 찾을 수 없거나 경로를 읽을 수 없습니다.';}}
  if(conflicts.has(file.repo)){installed.delete(file.id);issue='서로 다른 버전의 모델이 섞여 있습니다. 이 묶음을 삭제한 뒤 다시 다운로드하세요.';}
  files.set(file.id,{id:file.id,name:file.path.split('/').pop()!,installed:installed.has(file.id),bytes:asset?.bytes??0,estimatedBytes:file.estimatedBytes,path,...(issue?{issue}:{})});
 }
 const status:CatalogStatus={root,features:modelFeatures.map(feature=>({...feature,ready:feature.fileIds.every(id=>files.get(id)!.installed),files:feature.fileIds.map(id=>files.get(id)!)}))};
 return {status,records,installed,revisions,conflicts};
}
