import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,rename,rm,access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { openStore } from '../store.js';
import type { MediaInput } from '../../src/video.js';
import { validatePng } from '../generation/output.js';
import { probeVideo } from './media.js';
export async function registerMediaRoutes(app:FastifyInstance,dataDir:string,store:Awaited<ReturnType<typeof openStore>>) {
 const directory=join(dataDir,'inputs');await mkdir(directory,{recursive:true});
 let busy=false;const stopped=new AbortController();
 app.addHook('preClose',async()=>{stopped.abort();});
 app.addContentTypeParser('application/octet-stream',{parseAs:'buffer'},(_request,body,done)=>done(null,body));
 for(const kind of ['image','video'] as const) app.post(`/api/media/${kind}`,{bodyLimit:(kind==='image'?5:32)*1024**2},async(request,reply)=>{
  if(busy)return reply.code(409).send({error:'다른 미디어를 검사하고 있습니다.'});
  if(!Buffer.isBuffer(request.body))return reply.code(400).send({error:'binary 파일이 필요합니다.'});
  busy=true;const id=randomUUID(),fileName=`${id}.${kind==='image'?'png':'mp4'}`,file=join(directory,fileName),temp=`${file}.tmp`;
  try {
   const bytes=request.body;let metadata:Pick<MediaInput,'width'|'height'|'frames'|'fps'|'duration'>;
   if(kind==='image') {
    if(bytes.length<33)throw new Error('올바른 PNG 파일이 아닙니다.');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if(!width||!height||width>4096||height>4096||width*height>16*1024**2)throw new Error('PNG는 최대 4096px/16MP입니다.');
    validatePng(bytes,width,height);metadata={width,height};
    await writeFile(temp,bytes,{mode:0o600,flag:'wx'});
   } else {await writeFile(temp,bytes,{mode:0o600,flag:'wx'});metadata=await probeVideo(temp,stopped.signal);}
   const media:MediaInput={id,kind,fileName,...metadata,createdAt:new Date().toISOString()};
   await rename(temp,file);try{store.putMedia(media);}catch(error){await rm(file,{force:true});throw error;}
   reply.code(201);return media;
  }catch(error){reply.code(400);return {error:error instanceof Error?error.message:'미디어 검사 실패'};}
  finally{await rm(temp,{force:true});busy=false;}
 });
 app.get<{Params:{id:string}}>('/api/media/:id',async(request,reply)=>store.getMedia(request.params.id)??reply.code(404).send({error:'원본 파일이 없습니다.'}));
 app.get<{Params:{id:string}}>('/api/media/:id/file',async(request,reply)=>{
  const media=store.getMedia(request.params.id);if(!media)return reply.code(404).send({error:'원본 파일이 없습니다.'});
  const file=join(directory,media.fileName);try{await access(file);}catch{return reply.code(404).send({error:'원본 파일이 이동되거나 삭제되었습니다.'});}
  return reply.type(media.kind==='image'?'image/png':'video/mp4').send(createReadStream(file));
 });
 app.delete<{Params:{id:string}}>('/api/media/:id',async(request,reply)=>{
  const media=store.getMedia(request.params.id);if(!media)return reply.code(404).send({error:'원본 파일이 없습니다.'});
  if(!store.deleteMedia(media.id))return reply.code(409).send({error:'작업에서 사용하는 원본은 삭제할 수 없습니다.'});
  await rm(join(directory,media.fileName),{force:true});return {deleted:true};
 });
}
