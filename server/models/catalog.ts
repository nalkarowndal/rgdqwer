import {createHash} from 'node:crypto';
import {z} from 'zod';
import {downloadModelSchema,MAX_MODEL_BYTES,type DownloadModelInput} from '../../src/models.js';
import type {CatalogFile} from '../../src/model-catalog.js';
import {httpsResponse,validateDownloadUrl} from './network.js';
export type CatalogTransport=typeof httpsResponse;
export async function readCatalogBytes(source:string,signal:AbortSignal,limit:number,transport:CatalogTransport=httpsResponse):Promise<Buffer>{
 const bounded=AbortSignal.any([signal,AbortSignal.timeout(60000)]);let url=validateDownloadUrl(source);
 for(let redirects=0;redirects<=5;redirects++){
  bounded.throwIfAborted();const response=await transport(url,bounded);
  if([301,302,303,307,308].includes(response.status)){response.body.destroy();if(!response.headers.location)throw new Error('모델 정보 리디렉션 주소가 없습니다.');url=validateDownloadUrl(new URL(response.headers.location,url).href);continue;}
  if(response.status!==200){response.body.destroy();throw new Error(`모델 정보 HTTP ${response.status}: 인터넷 연결과 제공자 접근 권한을 확인하세요.`);}
  const chunks:Buffer[]=[];let size=0;const abort=()=>response.body.destroy(new Error('모델 정보 요청이 중단되었습니다.'));bounded.addEventListener('abort',abort,{once:true});
  try{bounded.throwIfAborted();for await(const raw of response.body){bounded.throwIfAborted();const chunk=Buffer.from(raw);size+=chunk.length;if(size>limit)throw new Error('모델 정보 크기 제한 초과');chunks.push(chunk);}return Buffer.concat(chunks);}
  finally{bounded.removeEventListener('abort',abort);response.body.destroy();}
 }
 throw new Error('모델 정보 리디렉션 제한 초과');
}
const sha=z.string().regex(/^[a-f0-9]{40}$/),size=z.number().int().positive().max(MAX_MODEL_BYTES);
const metadataSchema=z.object({sha,siblings:z.array(z.object({rfilename:z.string(),size:z.number().int().nonnegative(),blobId:z.string().optional(),lfs:z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/),size}).optional()})).max(10000)});
export const catalogUrl=(file:CatalogFile,revision:string)=>`https://huggingface.co/${file.repo}/resolve/${revision}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
export interface ResolvedCatalogFile {file:CatalogFile;input:DownloadModelInput}
export async function resolveCatalogFiles(files:CatalogFile[],revisions:Record<string,string>,signal:AbortSignal,transport:CatalogTransport=httpsResponse):Promise<ResolvedCatalogFile[]>{
 const resolved:ResolvedCatalogFile[]=[];
 for(const repo of new Set(files.map(f=>f.repo))){
  const revision=revisions[repo];if(revision)sha.parse(revision);
  const url=`https://huggingface.co/api/models/${repo}/revision/${revision??'main'}?blobs=true`;
  const metadata=metadataSchema.parse(JSON.parse((await readCatalogBytes(url,signal,8*1024**2,transport)).toString('utf8')));
  if(revision&&metadata.sha!==revision)throw new Error('요청한 모델 버전과 응답 버전이 다릅니다.');
  for(const file of files.filter(f=>f.repo===repo)){
   const matches=metadata.siblings.filter(f=>f.rfilename===file.path);if(matches.length!==1)throw new Error(`공식 저장소에서 필수 파일을 찾을 수 없습니다: ${file.path}`);
   const entry=matches[0];size.parse(entry.size);const sourceUrl=catalogUrl(file,metadata.sha);let hash=entry.lfs?.sha256;
   if(entry.lfs&&entry.lfs.size!==entry.size)throw new Error(`파일 크기 정보가 일치하지 않습니다: ${file.path}`);
   if(!hash){
    if(entry.size>8*1024**2||!entry.blobId||!sha.safeParse(entry.blobId).success)throw new Error(`검증 가능한 Git 파일 정보가 없습니다: ${file.path}`);
    const bytes=await readCatalogBytes(sourceUrl,signal,entry.size,transport);
    const blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if(bytes.length!==entry.size||blob!==entry.blobId)throw new Error(`Git 파일 해시가 일치하지 않습니다: ${file.path}`);
    hash=createHash('sha256').update(bytes).digest('hex');
   }
   const input=downloadModelSchema.parse({manifest:{name:file.path.split('/').pop()!,kind:file.kind,family:file.family,fileName:file.path.split('/').pop()!,bundle:file.bundle,sourceUrl,revision:metadata.sha,license:file.license},bytes:entry.size,sha256:hash,confirmed:true});
   resolved.push({file,input});
  }
 }
 return resolved;
}
