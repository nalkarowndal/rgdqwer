import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,rm,rename,access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { voiceProfileSchema,type AudioSource } from '../../src/voice.js';
import type { openStore } from '../store.js';
import { normalizeAudio } from './media.js';
export async function registerVoiceRoutes(app:FastifyInstance,dataDir:string,store:Awaited<ReturnType<typeof openStore>>) {
 const directory=join(dataDir,'audio');await mkdir(directory,{recursive:true});
 const stopped=new AbortController();let busy=false;app.addHook('preClose',async()=>{stopped.abort();});
 for(const format of ['wav','mp3','webm'] as const)app.post(`/api/voice/audio/${format}`,{bodyLimit:16*1024**2},async(request,reply)=>{
  if(busy)return reply.code(409).send({error:'다른 오디오를 검사하고 있습니다.'});
  if(!Buffer.isBuffer(request.body))return reply.code(400).send({error:'오디오 파일이 필요합니다.'});
  busy=true;const id=randomUUID(),fileName=`${id}.wav`,raw=join(directory,`${id}.upload`),temp=join(directory,`${id}.tmp`),file=join(directory,fileName);
  try{await writeFile(raw,request.body,{mode:0o600,flag:'wx'});const duration=await normalizeAudio(raw,format,temp,stopped.signal);await rename(temp,file);
   const source:AudioSource={id,fileName,duration,createdAt:new Date().toISOString()};try{store.putAudio(source);}catch(error){await rm(file,{force:true});throw error;}reply.code(201);return source;
  }catch(error){reply.code(400);return {error:error instanceof Error?error.message:'음성 업로드 실패'};}finally{await Promise.all([rm(raw,{force:true}),rm(temp,{force:true})]);busy=false;}
 });
 app.get<{Params:{id:string}}>('/api/voice/audio/:id/file',async(request,reply)=>{
  const source=store.getAudio(request.params.id);if(!source)return reply.code(404).send({error:'원본 음성이 없습니다.'});const file=join(directory,source.fileName);
  try{await access(file);}catch{return reply.code(404).send({error:'원본 음성이 이동되거나 삭제되었습니다.'});}return reply.type('audio/wav').send(createReadStream(file));
 });
 app.delete<{Params:{id:string}}>('/api/voice/audio/:id',async(request,reply)=>{
  const source=store.getAudio(request.params.id);if(!source)return reply.code(404).send({error:'원본 음성이 없습니다.'});if(!store.deleteAudio(source.id))return reply.code(409).send({error:'프로필 또는 작업에서 사용 중인 음성입니다.'});await rm(join(directory,source.fileName),{force:true});return {deleted:true};
 });
 app.get('/api/voice/profiles',async()=>store.listVoiceProfiles());
 app.post('/api/voice/profiles',async(request,reply)=>{
  const parsed=voiceProfileSchema.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:'프로필의 참고 음성·엔진·언어·사용 허가를 확인하세요.'});
  const p=parsed.data;if(p.referenceId){const source=store.getAudio(p.referenceId);if(!source||source.duration<3||source.duration>30)return reply.code(400).send({error:'참고 음성은 3–30초여야 합니다.'});}
  if(store.listVoiceProfiles().length>=100)return reply.code(409).send({error:'프로필은 최대 100개입니다.'});
  const profile={...p,id:randomUUID(),consentedAt:new Date().toISOString()};store.putVoiceProfile(profile);return reply.code(201).send(profile);
 });
 app.delete<{Params:{id:string}}>('/api/voice/profiles/:id',async(request,reply)=>{
  if(!store.getVoiceProfile(request.params.id))return reply.code(404).send({error:'프로필이 없습니다.'});store.deleteVoiceProfile(request.params.id);return {deleted:true};
 });
}
