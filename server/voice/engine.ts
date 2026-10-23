import { existsSync,readFileSync,statSync } from 'node:fs';
import { mkdir,mkdtemp,writeFile,rename,rm,access } from 'node:fs/promises';
import { dirname,isAbsolute,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isVoiceInput,type VoiceInput,type VoiceProfile,type VoiceStatus,voiceEngineSchema } from '../../src/voice.js';
import type { Job,Artifact } from '../../src/contracts.js';
import type { openStore } from '../store.js';
import { runProcess,ffmpeg,mediaToolsStatus } from '../video/process.js';
import { normalizeAudio,validateWav } from './media.js';
const modelSchema=z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),name:z.string().min(1).max(100),path:z.string().refine(isAbsolute),index:z.string().refine(isAbsolute).optional(),version:z.enum(['v1','v2']).default('v2')}).strict();
export function rvcModels(){
 const file=process.env.STUDIO_RVC_CATALOG;if(!file)return [];
 if(statSync(file).size>65536)throw new Error('RVC 목록 파일 크기 상한 초과');
 const rows=z.array(modelSchema).max(100).parse(JSON.parse(readFileSync(file,'utf8')));
 if(new Set(rows.map(m=>m.id)).size!==rows.length)throw new Error('중복 RVC 모델 ID');
 return rows;
}
const runner=()=>[resolve(dirname(fileURLToPath(import.meta.url)),'../../voice_worker/runner.py'),resolve(dirname(fileURLToPath(import.meta.url)),'../../../voice_worker/runner.py')].find(existsSync)!;
const python=(engine:string)=>engine==='rvc'?process.env.STUDIO_RVC_PYTHON:process.env.STUDIO_CHATTERBOX_PYTHON;
const statusSchema=z.object({engines:z.array(z.object({id:voiceEngineSchema,available:z.boolean(),message:z.string().max(2000)})).max(3)});
export async function voiceStatus():Promise<VoiceStatus>{
 let models:ReturnType<typeof rvcModels>=[];let catalogError='';try{models=rvcModels();}catch{catalogError='RVC 모델 목록 JSON·경로 설정을 확인하세요.';}
 const engines=await Promise.all((['chatterbox-tts','chatterbox-vc','rvc'] as const).map(async id=>{
  try{const executable=python(id);if(!executable)throw new Error(`${id==='rvc'?'STUDIO_RVC_PYTHON':'STUDIO_CHATTERBOX_PYTHON'}에 독립 환경 Python 실행 파일을 지정하세요.`);
   if(id==='rvc'&&catalogError)throw new Error(catalogError);
   const result=statusSchema.parse(JSON.parse(await runProcess(executable,[runner(),'status'],undefined,10000))).engines.find(e=>e.id===id);
   if(!result)throw new Error('음성 워커 상태 형식 오류');return result;
  }catch(error){return {id,available:false,message:error instanceof Error?error.message:'음성 환경 확인 실패'};}
 }));return {engines,models,tools:await mediaToolsStatus()};
}
type Store=Awaited<ReturnType<typeof openStore>>;
export function resolveVoiceProfile(input:VoiceInput,store:Store):VoiceProfile{
 const profile=store.getVoiceProfile(input.voiceProfileId);
 if(!profile||!profile.authorized||!profile.engines.includes(input.engine)||!profile.languages.includes(input.language))throw new Error('음성 프로필의 사용 허가·지원 언어·엔진을 확인하세요.');
 if(input.engine!=='rvc'){
  const ref=profile.referenceId?store.getAudio(profile.referenceId):undefined;
  if(!ref||ref.duration<3||ref.duration>30)throw new Error('3–30초 참고 음성을 등록하세요.');
 }
 if(input.engine!=='chatterbox-tts'&&(!input.sourceId||!store.getAudio(input.sourceId)))throw new Error('변환 원본 음성이 없습니다.');
 if(input.engine==='rvc'){
  const model=rvcModels().find(m=>m.id===profile.rvcModel);if(!model||!existsSync(model.path)||(model.index&&!existsSync(model.index)))throw new Error('설치된 RVC 모델·인덱스를 찾을 수 없습니다.');
  return {...profile,rvcModelPath:model.path};
 }return profile;
}
export async function runVoiceJob(job:Job,store:Store,dataDir:string,signal:AbortSignal):Promise<Artifact[]>{
 if(!isVoiceInput(job.input))throw new Error('음성 작업이 아닙니다.');const input=job.input;
 // Recheck revocation and assets immediately before starting a local child.
 const profile=resolveVoiceProfile(input,store);const executable=python(input.engine);
 if(!executable)throw new Error('음성 Python 환경을 설정하세요. 음성 스튜디오의 설치 안내를 확인하세요.');
 const root=join(dataDir,'voice-work'),outputs=join(dataDir,'outputs');await mkdir(root,{recursive:true});await mkdir(outputs,{recursive:true});
 const temp=await mkdtemp(join(root,`${job.id}-`));const committed:string[]=[];
 try{
  const audio=async(id:string|undefined,max:number)=>{if(!id)return undefined;const s=store.getAudio(id);if(!s)throw new Error('음성 원본이 없습니다.');const p=resolve(dataDir,'audio',s.fileName);await access(p);await validateWav(p,max);return p;};
  const reference=input.engine==='rvc'?undefined:await audio(profile.referenceId,30);
  const source=input.engine==='chatterbox-tts'?undefined:await audio(input.sourceId,60);
  const request=join(temp,'request.json'),raw=join(temp,'engine.wav'),wav=join(temp,'output.wav'),mp3=join(temp,'output.mp3');
  await writeFile(request,JSON.stringify({...input,reference,source,rvcModel:profile.rvcModel}),{flag:'wx',mode:0o600});
  await runProcess(executable,[runner(),'run',resolve(request),resolve(raw)],signal,30*60*1000);
  signal.throwIfAborted();const maximum=input.engine==='chatterbox-tts'?600:65;
  const duration=await normalizeAudio(raw,'wav',wav,signal,maximum);
  await runProcess(ffmpeg(),['-v','error','-xerror','-nostdin','-f','wav','-i',wav,'-map_metadata','-1','-c:a','libmp3lame','-b:a','128k','-f','mp3',mp3],signal,120000,true);
  await normalizeAudio(mp3,'mp3',join(temp,'checked.wav'),signal,maximum+1);
  const artifacts:Artifact[]=[];
  for(const [file,ext,mediaType] of [[wav,'wav','audio/wav'],[mp3,'mp3','audio/mpeg']] as const){signal.throwIfAborted();const id=randomUUID(),fileName=`${id}.${ext}`,destination=join(outputs,fileName);await rename(file,destination);committed.push(destination);artifacts.push({id,fileName,mediaType,duration});}
  signal.throwIfAborted();return artifacts;
 }catch(error){await Promise.all(committed.map(file=>rm(file,{force:true})));throw error;}finally{await rm(temp,{recursive:true,force:true});}
}
