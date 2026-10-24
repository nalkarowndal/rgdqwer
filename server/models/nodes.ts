import {spawn} from 'node:child_process';
import {cp,mkdir,readdir,lstat,readFile,rm} from 'node:fs/promises';
import {join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import type {NodePack,NodeInstallInput} from '../../src/models.js';
import {noSymlinks,hashFile,ensureSpace} from './files.js';
async function boundedSize(root:string){let bytes=0,entries=0;async function walk(path:string,depth:number){if(depth>40)throw new Error('Git 폴더 깊이 제한');for(const name of await readdir(path)){if(++entries>20000)throw new Error('Git 항목 수 제한');const target=join(path,name),info=await lstat(target);if(info.isDirectory())await walk(target,depth+1);else bytes+=info.size;if(bytes>512*1024**2)throw new Error('Git 작업 폴더 512MiB 제한');}}await walk(root,0);}
const MAX_BYTES=256*1024**2,MAX_FILES=10000;
export async function inspectTree(root:string){
 await noSymlinks(root);const hash=createHash('sha256');let bytes=0,files=0;let requirements='',license='';
 async function walk(directory:string,depth:number){if(depth>32)throw new Error('노드 폴더 깊이 제한 초과');for(const name of (await readdir(directory)).sort()){if(name.toLowerCase()==='.git')throw new Error('추가된 Git 메타데이터는 삭제하거나 활성화하지 않습니다.');const path=join(directory,name),info=await lstat(path);if(info.isSymbolicLink())throw new Error('노드 소스의 링크는 허용되지 않습니다.');if(++files>MAX_FILES)throw new Error('노드 파일 수 제한 초과');if(info.isDirectory()&&name==='__pycache__'){for(const cacheName of await readdir(path)){const cache=await lstat(join(path,cacheName));if(!cache.isFile()||cache.isSymbolicLink()||!/^.+\.(cpython|pypy)-[a-zA-Z0-9_-]+(?:\.opt-[0-9]+)?\.pyc$/.test(cacheName))throw new Error('변경된 Python 캐시 폴더입니다.');bytes+=cache.size;if(++files>MAX_FILES||bytes>MAX_BYTES)throw new Error('노드 캐시 크기 제한 초과');}continue;}if(info.isDirectory()){hash.update(`D:${relative(root,path)}\0`);await walk(path,depth+1);}else if(info.isFile()){bytes+=info.size;if(bytes>MAX_BYTES)throw new Error('노드 소스 256MiB 제한 초과');const digest=await hashFile(path);hash.update(`F:${relative(root,path)}:${digest.sha256}\0`);if(directory===root&&/^(requirements.*\.txt|pyproject\.toml|setup\.py)$/i.test(name)){if(info.size>65536)throw new Error('의존성 문서 64KiB 제한 초과');requirements+=`\n# ${name}\n${await readFile(path,'utf8')}`;}if(directory===root&&/^(license|copying)(\..*)?$/i.test(name)){if(info.size>65536)throw new Error('라이선스 문서 64KiB 제한 초과');license+=await readFile(path,'utf8');}}else throw new Error('일반 소스 파일만 허용됩니다.');}}
 await walk(root,0);return {treeHash:hash.digest('hex'),bytes,files,requirements,license};
}
/** Isolated Git configuration prevents hooks, checkout filters and credential prompts. Proxy/CA environment is retained. */
export async function gitCommand(cwd:string,args:string[],signal:AbortSignal){
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('GIT_')&&!['GIT_SSL_CAINFO','GIT_SSL_CAPATH','GIT_HTTP_EXTRA_HEADER'].includes(key))delete env[key];
 Object.assign(env,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_LFS_SKIP_SMUDGE:'1'});
 return new Promise<string>((resolve,reject)=>{const child=spawn('git',['-c','core.hooksPath=/dev/null','-c','protocol.file.allow=never','-c','protocol.ext.allow=never','-c','http.followRedirects=false',...args],{cwd,env,windowsHide:true,shell:false,signal});let output='',error='',failure:Error|undefined;const timer=setTimeout(()=>{failure=new Error('Git 작업 시간 초과');child.kill('SIGKILL');},120000);
 let checking=false;const monitor=setInterval(()=>{if(checking)return;checking=true;void boundedSize(cwd).catch(e=>{if((e as NodeJS.ErrnoException).code!=='ENOENT'){failure=e;child.kill('SIGKILL');}}).finally(()=>{checking=false;});},100);
 child.stdout.on('data',(b:Buffer)=>{output+=b.toString();if(output.length>1024**2){failure=new Error('Git 출력 제한 초과');child.kill('SIGKILL');}});child.stderr.on('data',(b:Buffer)=>{error=(error+b.toString()).slice(-4096);});child.on('error',e=>{failure=e;});child.on('close',code=>{clearTimeout(timer);clearInterval(monitor);if(failure)reject(failure);else if(code!==0)reject(new Error(`Git 작업 실패 (${code}): ${error}`));else resolve(output.trim());});});
}
export async function stagePack(input:NodeInstallInput,dataDir:string,id:string,signal:AbortSignal):Promise<NodePack>{
 const root=join(dataDir,'node-staging',id);await noSymlinks(root,true);await ensureSpace(root,MAX_BYTES*2);
 try{await gitCommand(root,['init','--template='],signal);await gitCommand(root,['fetch','--depth=1','--no-tags',input.repository,input.commit],signal);const actual=await gitCommand(root,['rev-parse','FETCH_HEAD'],signal);if(actual!==input.commit)throw new Error('요청한 커밋과 일치하지 않습니다.');await gitCommand(root,['checkout','--detach',input.commit],signal);await rm(join(root,'.git'),{recursive:true,force:true});const info=await inspectTree(root);return {...info,id,root,name:input.name,repository:input.repository,commit:input.commit,installedAt:new Date().toISOString()};}catch(error){await rm(root,{recursive:true,force:true});throw error;}
}
export async function activatePack(pack:NodePack,dataDir:string,acknowledged:boolean){
 if(!acknowledged)throw new Error('코드 실행 및 의존성 검토를 확인하세요.');if(pack.activePath)throw new Error('이미 활성화되어 있습니다.');if((await inspectTree(pack.root)).treeHash!==pack.treeHash)throw new Error('검토 후 변경된 노드입니다.');const parent=join(dataDir,'custom_nodes');await noSymlinks(parent,true);const activePath=join(parent,pack.id);await mkdir(activePath);try{for(const name of await readdir(pack.root)){if(name==='.git')continue;await cp(join(pack.root,name),join(activePath,name),{recursive:true,errorOnExist:true,force:false});}if((await inspectTree(activePath)).treeHash!==pack.treeHash)throw new Error('노드 복사 검증 실패');return {...pack,activePath};}catch(error){await rm(activePath,{recursive:true,force:true});throw error;}
}
export async function packPaths(pack:NodePack,removeStaging:boolean,allowMissing=false){
 const paths=[...(pack.activePath?[pack.activePath]:[]),...(removeStaging?[pack.root]:[])];const existing:string[]=[];
 for(const path of paths){await noSymlinks(dirname(path));try{await lstat(path);}catch(error){if(allowMissing&&(error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}if((await inspectTree(path)).treeHash!==pack.treeHash)throw new Error('변경된 노드 폴더는 삭제하지 않습니다.');existing.push(path);}return existing;
}
export async function removePack(pack:NodePack,removeStaging:boolean,allowMissing=false){
 const paths=await packPaths(pack,removeStaging,allowMissing);for(const path of paths)await rm(path,{recursive:true});const next={...pack};delete next.activePath;return next;
}
