import {createReadStream,createWriteStream,constants} from 'node:fs';
import {lstat,mkdir,statfs,link,rm,open,stat,readdir} from 'node:fs/promises';
import {resolve,parse,relative,join,dirname,isAbsolute,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform,type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {MAX_MODEL_BYTES,type DiscoveredModel} from '../../src/models.js';
export async function noSymlinks(path:string,create=false){
 if(!isAbsolute(path))throw new Error('절대 경로를 입력하세요.');const target=resolve(path),root=parse(target).root;let current=root;
 for(const part of target.slice(root.length).split(sep).filter(Boolean)){current=join(current,part);try{const info=await lstat(current);if(info.isSymbolicLink())throw new Error('심볼릭 링크 경로는 사용할 수 없습니다.');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(!create)throw error;await mkdir(current,{mode:0o700});}}
 return target;
}
export function inside(root:string,path:string){const rel=relative(resolve(root),resolve(path));if(!rel||rel==='..'||rel.startsWith(`..${sep}`)||isAbsolute(rel))throw new Error('관리 폴더 밖의 경로입니다.');return resolve(path);}
export async function ensureSpace(directory:string,bytes:number){const disk=await statfs(directory);if(disk.bavail*disk.bsize<bytes+64*1024**2)throw new Error('디스크 여유 공간이 부족합니다.');}
export async function hashFile(file:string,signal?:AbortSignal){await noSymlinks(file);const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await handle.stat();if(!info.isFile())throw new Error('일반 파일이 필요합니다.');const hash=createHash('sha256');let size=0;for await(const chunk of handle.createReadStream({autoClose:false})){signal?.throwIfAborted();size+=chunk.length;if(size>MAX_MODEL_BYTES)throw new Error('모델 크기 상한 초과');hash.update(chunk);}return {sha256:hash.digest('hex'),bytes:size};}finally{await handle.close();}}
/** Stage in the destination volume; hard-link commit is atomic and never overwrites. */
export async function storeStream(source:Readable,root:string,relativePath:string,total:number,expectedHash:string|undefined,signal:AbortSignal,onProgress:(bytes:number)=>void,temporaryId:string=randomUUID()){
 if(!Number.isSafeInteger(total)||total<=0||total>MAX_MODEL_BYTES)throw new Error('모델 크기는 1B–64GiB여야 합니다.');
 const destination=inside(root,join(root,relativePath));await noSymlinks(root,true);await noSymlinks(dirname(destination),true);await ensureSpace(root,total);
 const temporary=join(root,`.install-${temporaryId}.tmp`);let committed=false;const hash=createHash('sha256');let received=0;
 try{const counter=new Transform({transform(chunk:Buffer,_encoding,callback){received+=chunk.length;if(received>total){callback(new Error('선언한 파일 크기를 초과했습니다.'));return;}hash.update(chunk);try{onProgress(received);callback(null,chunk);}catch(error){callback(error as Error);}}});
  await pipeline(source,counter,createWriteStream(temporary,{flags:'wx',mode:0o600}),{signal});
  if(received!==total)throw new Error('파일 크기가 일치하지 않습니다.');const sha256=hash.digest('hex');if(expectedHash&&sha256!==expectedHash)throw new Error('SHA256이 일치하지 않습니다.');
  signal.throwIfAborted();await noSymlinks(dirname(destination));await link(temporary,destination);committed=true;return {sha256,bytes:received,destination};
 }catch(error){source.destroy();if(committed)await rm(destination,{force:true});throw error;}finally{await rm(temporary,{force:true});}
}
export async function importFile(sourcePath:string,root:string,relativePath:string,signal:AbortSignal,onProgress:(bytes:number)=>void,temporaryId:string=randomUUID()){
 await noSymlinks(sourcePath);const handle=await open(sourcePath,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const info=await handle.stat();if(!info.isFile())throw new Error('일반 모델 파일을 선택하세요.');return await storeStream(handle.createReadStream({autoClose:false}),root,relativePath,info.size,undefined,signal,onProgress,temporaryId);}finally{await handle.close();}
}
export async function scanModels(roots:string[],managed:Set<string>){const files:DiscoveredModel[]=[];const warnings:string[]=[];let visited=0;
 async function walk(root:string,directory:string,depth:number){if(depth>8){warnings.push('탐색 깊이 8단계 제한');return;}for(const entry of await readdir(directory,{withFileTypes:true})){if(++visited>10000)throw new Error('탐색 항목이 10000개를 초과했습니다. 범위를 줄이세요.');if(entry.name.startsWith('.'))continue;const path=join(directory,entry.name);const info=await lstat(path);if(info.isSymbolicLink()){warnings.push(`링크 제외: ${entry.name}`);continue;}if(info.isDirectory())await walk(root,path,depth+1);else if(info.isFile()&&/\.(safetensors|ckpt|pt|pth|bin|onnx|json|index|yaml|txt|model|tiktoken)$/i.test(entry.name))files.push({root,relativePath:relative(root,path),bytes:info.size,managed:managed.has(resolve(path))});}}
 for(const root of new Set(roots)){try{await noSymlinks(root);await walk(root,root,0);}catch(error){warnings.push(error instanceof Error?error.message:'탐색 실패');}}
 return {files,warnings};
}
export {createReadStream,stat};
