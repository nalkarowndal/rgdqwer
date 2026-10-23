import { useEffect,useState } from 'react';
import { api,artifactBlob,audioSourceBlob } from './api';
import type { GenerationInput,Job,Artifact } from './contracts';
import { isVoiceInput } from './voice';
export function AudioPlayer({sourceId,artifact,label}:{sourceId?:string;artifact?:Artifact;label:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');const id=artifact?.id;
 useEffect(()=>{let active=true,url='';setUrl('');setError('');if(!sourceId&&!id)return;
  void (id?artifactBlob(id):audioSourceBlob(sourceId!)).then(blob=>{if(!active)return;url=URL.createObjectURL(blob);setUrl(url);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;if(url)URL.revokeObjectURL(url);};
 },[sourceId,id]);
 return <div className="audio-preview"><p>{label}</p>{url&&<><audio aria-label={label} src={url} controls preload="metadata" />{artifact&&<a href={url} download={artifact.fileName}>{artifact.mediaType==='audio/wav'?'WAV':'MP3'} 다운로드</a>}</>}{error&&<p role="alert">{error}</p>}</div>;
}
const labels:Record<Job['state'],string>={preparing:'준비 중',queued:'대기 중',running:'음성 생성 중',cancelling:'취소 중',postprocessing:'저장 중',completed:'완료',failed:'실패',cancelled:'취소됨',interrupted:'중단됨',unknown:'상태 미확인'};
export function VoiceJobCard({job,onChanged,reuse}:{job:Job;onChanged:()=>Promise<void>;reuse:(input:GenerationInput)=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);if(!isVoiceInput(job.input))return null;
 async function action(name:string){setBusy(true);try{await api(`jobs/${job.id}/${name}`,undefined,'POST');await onChanged();}catch(e){setError(e instanceof Error?e.message:'요청 실패');}finally{setBusy(false);}}
 return <article className="panel job-card"><div className="job-heading"><h2>{labels[job.state]}</h2><time>{new Date(job.createdAt).toLocaleString('ko-KR')}</time></div>
 <p>{job.voiceProfile?.name} · {job.input.engine} · {job.input.language}</p><p className="job-prompt">{job.input.prompt}</p>
 {job.input.sourceId&&<AudioPlayer sourceId={job.input.sourceId} label="변환 전 원본" />}
 {job.artifacts.map(artifact=><AudioPlayer key={artifact.id} artifact={artifact} label={`음성 결과 ${artifact.mediaType==='audio/wav'?'WAV':'MP3'}`} />)}
 {(job.error||error)&&<div className="notice error" role="alert">{error||job.error}</div>}
 <div className="form-actions"><button className="secondary-button" onClick={()=>reuse(job.input)}>설정 재사용</button>{['preparing','queued','running'].includes(job.state)&&<button className="secondary-button" disabled={busy} onClick={()=>void action('cancel')}>작업 취소</button>}{['unknown','interrupted'].includes(job.state)&&<button className="secondary-button" disabled={busy} onClick={()=>void action('resume')}>상태 확인</button>}</div>
 <details><summary>음성 설정 및 사용 허가</summary><dl><dt>시드 / 피치</dt><dd>{job.input.seed} / {job.input.pitch}</dd><dt>강조 / CFG / 온도</dt><dd>{job.input.exaggeration} / {job.input.cfg} / {job.input.temperature}</dd><dt>사용 허가 / 확인 시각</dt><dd>{job.voiceProfile?.permission} / {job.voiceProfile?.consentedAt}</dd>{job.voiceProfile?.rvcModelPath&&<><dt>RVC 모델</dt><dd>{job.voiceProfile.rvcModelPath}</dd></>}</dl><pre>{job.log.join('\n')}</pre></details></article>;
}
