import {storeStream} from './files.js';
import {httpsResponse,validateDownloadUrl,type DownloadResponse} from './network.js';
export async function downloadAsset(source:string,root:string,path:string,bytes:number,sha256:string,signal:AbortSignal,progress:(bytes:number)=>void,id:string,transport:(url:URL,signal:AbortSignal)=>Promise<DownloadResponse>=httpsResponse){
 let url=validateDownloadUrl(source);
 for(let redirects=0;redirects<=5;redirects++){
  signal.throwIfAborted();const response=await transport(url,signal);
  if([301,302,303,307,308].includes(response.status)){response.body.destroy();if(!response.headers.location)throw new Error('리디렉션 주소가 없습니다.');url=validateDownloadUrl(new URL(response.headers.location,url).href);continue;}
  if(response.status!==200){response.body.destroy();throw new Error(`다운로드 HTTP ${response.status}`);}
  return storeStream(response.body,root,path,bytes,sha256,signal,progress,id);
 }
 throw new Error('리디렉션이 5회를 초과했습니다.');
}
