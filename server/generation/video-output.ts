import { mkdir,writeFile,readFile,rename,rm,access } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Artifact,Job } from '../../src/contracts.js';
import { isVideoInput,type MediaInput,type VideoInput } from '../../src/video.js';
import { processVideo,validateVideoOutput } from '../video/media.js';
import { boundedBytes,type ComfyClient } from './client.js';
import { validatePng } from './output.js';
export async function sourcePath(media:MediaInput|undefined,input:VideoInput,dataDir:string) {
 if(!media||media.kind!==(input.mode==='i2v'?'image':'video'))throw new Error('올바른 원본을 업로드하세요. I2V는 PNG, 영상 변환은 MP4가 필요합니다.');
 const file=join(dataDir,'inputs',media.fileName);try{await access(file);}catch{throw new Error('원본 파일이 이동되거나 삭제되었습니다. 다시 업로드하세요.');}return file;
}
export async function prepareVideoSource(client:ComfyClient,job:Job,media:MediaInput|undefined,dataDir:string,signal:AbortSignal) {
 if(!isVideoInput(job.input)||job.input.mode==='t2v')return undefined;
 const input=job.input;const source=await sourcePath(media,input,dataDir);let file=source;let temporary:string|undefined;
 try {
  if(input.mode==='v2v'){temporary=join(dataDir,'inputs',`${job.id}-normalized.mp4`);await processVideo(source,temporary,{...input,mode:'convert',includeAudio:false},signal);file=temporary;}
  else {const bytes=await readFile(file);validatePng(bytes,media!.width,media!.height);}
  signal.throwIfAborted();const name=`rgdqwer_${job.id}.${input.mode==='i2v'?'png':'mp4'}`;await client.upload(await readFile(file),name,signal);return name;
 }finally{if(temporary)await rm(temporary,{force:true});}
}
export async function saveVideoOutput(client:ComfyClient,job:Job,raw:unknown,directory:string,signal:AbortSignal):Promise<Artifact> {
 if(!isVideoInput(job.input))throw new Error('영상 작업이 아닙니다.');
 const value=z.object({filename:z.string(),subfolder:z.literal('rgdqwer'),type:z.literal('output')}).parse(raw);
 if(!value.filename.startsWith(`${job.id}_`)||!value.filename.endsWith('.mp4')||/[\\/]/.test(value.filename))throw new Error('작업에 속하지 않는 영상 결과입니다.');
 const bytes=await boundedBytes(await client.request(`/view?${new URLSearchParams(value)}`),64*1024**2);
 await mkdir(directory,{recursive:true});const fileName=`${job.id}.mp4`,file=join(directory,fileName),temp=join(directory,`${job.id}.tmp.mp4`);
 try{await writeFile(temp,bytes,{mode:0o600,flag:'wx'});const metadata=await validateVideoOutput(temp,job.input,signal);await rename(temp,file);return {id:job.id,fileName,mediaType:'video/mp4',...metadata};}finally{await rm(temp,{force:true});}
}
export async function localVideoArtifacts(job:Job,media:MediaInput|undefined,dataDir:string,signal:AbortSignal):Promise<Artifact[]> {
 if(!isVideoInput(job.input))throw new Error('영상 작업이 아닙니다.');
 const input=job.input,source=await sourcePath(media,input,dataDir),directory=join(dataDir,'outputs');await mkdir(directory,{recursive:true});
 const prefix=join(directory,`${job.id}.tmp`),output=input.mode==='extract'?prefix:`${prefix}.mp4`;
 const files=await processVideo(source,output,input,signal);const finalFiles:string[]=[];
 try {
  const artifacts:Artifact[]=[];
  for(const [index,file] of files.entries()) {signal.throwIfAborted();const id=index===0?job.id:randomUUID(),fileName=`${id}.${input.mode==='extract'?'png':'mp4'}`,final=join(directory,fileName);await rename(file,final);finalFiles.push(final);artifacts.push({id,fileName,width:input.width,height:input.height,mediaType:input.mode==='extract'?'image/png':'video/mp4',...(input.mode==='extract'?{}:{frames:input.frames,fps:input.fps,duration:input.frames/input.fps})});}
  return artifacts;
 }catch(error){await Promise.all(finalFiles.map(f=>rm(f,{force:true})));throw error;}finally{await Promise.all(files.map(f=>rm(f,{force:true})));}
}
