import {ImageLoras} from './ImageLoras';
import {imageIssues,type ImageInventory} from './image';
import { isVoiceInput } from './voice';
import { VoiceJobCard } from './VoiceJobCard';
import { isVideoInput } from './video';
import { isKreaInput } from './krea';
import { useEffect, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react';
import { Download, Image as ImageIcon, RefreshCw, Square, WandSparkles } from 'lucide-react';
import { PromptEditor } from './PromptEditor';
import { compilePrompt, createPromptDocument, type PromptDocument } from './prompt';
import { api, artifactBlob } from './api';
import type { EngineStatus, ImageInput, GenerationInput, Job } from './contracts';

const recommended=(names:string[],name:string)=>names.find(n=>n.replaceAll('\\','/').split('/').at(-1)===name)??'';
export type ImageDraft = Omit<ImageInput, 'seed' | 'prompt' | 'negative' | 'promptDocument'> & { seed: string; promptDocument: PromptDocument };
export const initialDraft: ImageDraft = { profile: 'sd15', checkpoint: '', promptDocument: createPromptDocument(), width: 512, height: 512, seed: '', steps: 20, cfg: 7 };
const labels: Record<Job['state'], string> = { preparing: '준비 중', queued: '대기 중', running: '생성 중', cancelling: '취소 확인 중', postprocessing: '결과 저장 중', completed: '완료', failed: '실패', cancelled: '취소됨', interrupted: '추적 중단', unknown: '상태 미확인' };
export const isPending = (job: Job) => !['completed','failed','cancelled'].includes(job.state);

export function ImageStudio({ engine, jobs, draft, setDraft, onChanged, reuse }: {
  engine?: EngineStatus; jobs: Job[]; draft: ImageDraft; setDraft: Dispatch<SetStateAction<ImageDraft>>;
  onChanged: () => Promise<void>; reuse: (input: GenerationInput) => void;
}) {
  const [sending, setSending] = useState(false); const [error, setError] = useState('');
  const [inventory,setInventory]=useState<ImageInventory>();const [inventoryError,setInventoryError]=useState('');const [inventoryRefresh,setInventoryRefresh]=useState(0);const [loadingInventory,setLoadingInventory]=useState(true);
  useEffect(()=>{let active=true;setLoadingInventory(true);setInventoryError('');void api<ImageInventory>('image/status').then(value=>{if(active)setInventory(value);}).catch(err=>{if(active){setInventory(undefined);setInventoryError(err instanceof Error?err.message:'모델 목록 조회 실패');}}).finally(()=>{if(active)setLoadingInventory(false);});return()=>{active=false;};},[engine?.checkedAt,inventoryRefresh]);
  const anima=draft.profile==='anima';
  function changeProfile(profile:ImageInput['profile']){
    setDraft({...draft,profile,checkpoint:profile==='anima'?recommended(inventory?.diffusionModels??[],'anima-base-v1.0.safetensors'):engine?.checkpoints[0]??'',textEncoder:profile==='anima'?recommended(inventory?.textEncoders??[],'qwen_3_06b_base.safetensors')||undefined:undefined,vae:profile==='anima'?recommended(inventory?.vaes??[],'qwen_image_vae.safetensors')||undefined:undefined,loras:draft.loras?.map(l=>({...l,enabled:false})),width:profile==='sd15'?512:1024,height:profile==='sd15'?512:1024,steps:profile==='anima'?30:profile==='sd15'?20:25,cfg:profile==='anima'?4:profile==='sd15'?7:5});
  }
  useEffect(()=>{
    if(!inventory)return;
    if(draft.profile==='anima'){
      const checkpoint=draft.checkpoint||recommended(inventory.diffusionModels,'anima-base-v1.0.safetensors');
      const textEncoder=draft.textEncoder||recommended(inventory.textEncoders,'qwen_3_06b_base.safetensors')||undefined;
      const vae=draft.vae||recommended(inventory.vaes,'qwen_image_vae.safetensors')||undefined;
      if(checkpoint!==draft.checkpoint||textEncoder!==draft.textEncoder||vae!==draft.vae)setDraft(value=>({...value,checkpoint,textEncoder,vae}));
    }else if(!draft.checkpoint&&inventory.checkpoints[0])setDraft(value=>({...value,checkpoint:inventory.checkpoints[0]}));
  },[inventory,draft.profile,draft.checkpoint,draft.textEncoder,draft.vae,setDraft]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try {
      const seed = draft.seed.trim() ? Number(draft.seed) : crypto.getRandomValues(new Uint32Array(1))[0];
      const result = compilePrompt(draft.promptDocument, draft.profile);
      await api<Job>('jobs', { ...draft, seed, prompt: result.positive, negative: result.negative }, 'POST'); await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : '생성 요청 실패'); }
    finally { setSending(false); }
  }
  const issues=inventory?imageIssues({...draft,seed:0,prompt:'preview',negative:''},inventory):['모델 목록을 확인하세요.'];
  const ready=engine?.state==='connected'&&!loadingInventory&&issues.length===0;
  const models=anima?inventory?.diffusionModels??[]:inventory?.checkpoints??engine?.checkpoints??[];
  const pending = jobs.some(isPending);
  const latest = jobs.find(job => !isVoiceInput(job.input) && !isKreaInput(job.input) && !isVideoInput(job.input));
  const maximum = draft.profile === 'sd15' ? 768 : 1024;
  return <><div className="page-heading"><div><p className="eyebrow">TEXT TO IMAGE</p><h1>이미지 스튜디오</h1><p className="subtitle">내 ComfyUI의 모델로 이미지를 생성하고 LoRA 설정을 함께 보관합니다.</p></div><span className="milestone-tag">M2 · 배치 1</span></div>
    <div className="image-layout"><form className="panel settings-panel image-form" onSubmit={event => void submit(event)}>
      <h2><WandSparkles size={19} /> 새로운 이미지</h2>
      <label htmlFor="model-profile">모델 프로필</label>
      <select id="model-profile" value={draft.profile} onChange={e=>changeProfile(e.target.value as ImageInput['profile'])}>
        <option value="sd15">SD 1.5</option><option value="sdxl">SDXL</option><option value="illustrious">Illustrious / WAI-Illustrious</option><option value="anima">Anima Base v1</option>
      </select><p className="field-help">모델 설명에 맞는 프로필을 선택하세요. 프로필을 바꾸면 기존 LoRA는 비활성화됩니다. Krea는 Krea 2 스튜디오를 사용하세요.</p>
      <label htmlFor="checkpoint">{anima?'Anima 확산 모델':'체크포인트'}</label><select id="checkpoint" value={draft.checkpoint} onChange={e=>setDraft({...draft,checkpoint:e.target.value})}>
        <option value="">모델을 선택하세요</option>{models.map(name=><option key={name}>{name}</option>)}
        {draft.checkpoint&&!models.includes(draft.checkpoint)&&<option value={draft.checkpoint}>{draft.checkpoint} · 현재 찾을 수 없음</option>}
      </select>
      {anima&&<>
        <label htmlFor="anima-encoder">Anima 텍스트 인코더</label><select id="anima-encoder" value={draft.textEncoder??''} onChange={e=>setDraft({...draft,textEncoder:e.target.value||undefined})}><option value="">인코더 선택</option>{inventory?.textEncoders.map(name=><option key={name}>{name}</option>)}{draft.textEncoder&&!inventory?.textEncoders.includes(draft.textEncoder)&&<option>{draft.textEncoder}</option>}</select>
        <label htmlFor="anima-vae">Anima VAE</label><select id="anima-vae" value={draft.vae??''} onChange={e=>setDraft({...draft,vae:e.target.value||undefined})}><option value="">VAE 선택</option>{inventory?.vaes.map(name=><option key={name}>{name}</option>)}{draft.vae&&!inventory?.vaes.includes(draft.vae)&&<option>{draft.vae}</option>}</select>
        <p className="field-help">모델·확장 관리자 → 기능별 다운로드 → Anima에서 3개 파일을 받으세요. 최신 ComfyUI에서 관리 폴더 경로를 적용·재시작한 뒤 Base v1 / qwen_3_06b_base / qwen_image_vae를 선택합니다.</p>
      </>}
      <button type="button" className="secondary-button" disabled={loadingInventory} onClick={()=>setInventoryRefresh(n=>n+1)}>{loadingInventory?'모델 목록 확인 중…':'모델·LoRA 목록 새로고침'}</button>
      {inventoryError&&<p role="alert" className="notice error">{inventoryError}</p>}
      <ImageLoras profile={draft.profile} rows={draft.loras??[]} files={anima?inventory?.animaLoras??[]:inventory?.loras??[]} onChange={loras=>setDraft(value=>({...value,loras}))}/>
      <PromptEditor document={draft.promptDocument} profile={draft.profile} onChange={promptDocument => setDraft(value => ({ ...value, promptDocument }))} />
      <details><summary>상세 생성 설정</summary><div className="parameter-grid">
        <div><label htmlFor="width">가로 (px)</label><input id="width" type="number" min={256} max={maximum} step={64} required value={draft.width} onChange={e => setDraft({ ...draft, width: Number(e.target.value) })} /></div>
        <div><label htmlFor="height">세로 (px)</label><input id="height" type="number" min={256} max={maximum} step={64} required value={draft.height} onChange={e => setDraft({ ...draft, height: Number(e.target.value) })} /></div>
        <div><label htmlFor="steps">스텝</label><input id="steps" type="number" min={1} max={80} required value={draft.steps} onChange={e => setDraft({ ...draft, steps: Number(e.target.value) })} /></div>
        <div><label htmlFor="cfg">CFG</label><input id="cfg" type="number" min={1} max={30} step={0.5} required value={draft.cfg} onChange={e => setDraft({ ...draft, cfg: Number(e.target.value) })} /></div>
      </div><label htmlFor="seed">시드 (비우면 무작위)</label><input id="seed" type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={draft.seed} onChange={e => setDraft({ ...draft, seed: e.target.value })} />
        <p className="field-help">시드는 결과와 함께 저장합니다. 샘플러 {anima?'er_sde':'euler'} · 스케줄러 {anima?'simple':'normal'} · 배치 1 고정.</p>
      </details>
      <div className="notice">8GB에서 모델별 안정성은 실기 검증 전입니다. 메모리 오류 시 해상도를 낮추세요. 안전 취소는 최신 ComfyUI의 작업별 취소 API가 필요합니다.</div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="primary-button generate-button" disabled={sending || pending || !ready || !compilePrompt(draft.promptDocument, draft.profile).valid}><ImageIcon size={16} />{sending ? '요청 중…' : '이미지 생성'}</button>
      {!ready && <p className="field-help">{loadingInventory?'모델 목록 확인 중입니다.':issues.join(' · ')||'설정에서 ComfyUI를 연결하세요.'}</p>}
      {pending && <p className="field-help">기존 작업의 실행 또는 상태 확인이 끝난 뒤 새로 생성할 수 있습니다.</p>}
    </form><section className="image-result" aria-label="현재 작업">
      {latest ? <JobCard key={latest.id} job={latest} onChanged={onChanged} reuse={reuse} /> : <div className="panel empty-state"><ImageIcon size={42} /><h2>첫 이미지를 만들어 보세요</h2><p>생성 결과와 진행 상태가 여기에 표시됩니다.</p></div>}
    </section></div></>;
}
export function JobHistory({ jobs, onChanged, reuse }: { jobs: Job[]; onChanged: () => Promise<void>; reuse: (input: GenerationInput) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">YOUR CREATIONS</p><h1>작업 기록 / 라이브러리</h1><p className="subtitle">최근 20개 작업 · 생성 설정과 저장된 결과를 다시 사용할 수 있습니다.</p></div></div>
    {jobs.length ? <div className="history-grid">{jobs.slice(0,20).map(job => <JobCard key={job.id} job={job} onChanged={onChanged} reuse={reuse} />)}</div> : <div className="panel empty-state"><h2>저장된 작업이 없습니다</h2><p>이미지 스튜디오에서 첫 생성을 시작하세요.</p></div>}</>;
}
export function JobCard(props: {job:Job;onChanged:()=>Promise<void>;reuse:(input:GenerationInput)=>void}) {
  return isVoiceInput(props.job.input)?<VoiceJobCard {...props}/>:<VisualJobCard {...props}/>;
}
function VisualJobCard({ job, onChanged, reuse }: { job: Job; onChanged: () => Promise<void>; reuse: (input: GenerationInput) => void }) {
  const [image, setImage] = useState(''); const [imageError, setImageError] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const localVideo=isVideoInput(job.input)&&job.input.profile==='video-tools';
  const [frameIndex,setFrameIndex]=useState(0);
  const artifact = job.artifacts[frameIndex] ?? job.artifacts[0]; const artifactId = artifact?.id;
  useEffect(() => {
    let active = true; let url = ''; setImage(''); setImageError('');
    if (artifactId) void artifactBlob(artifactId).then(blob => {
      if (!active) return; url = URL.createObjectURL(blob); setImage(url);
    }).catch(err => { if (active) setImageError(err.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [artifactId]); // Metadata identity is stable even when the job list is polled.
  async function action(name: 'cancel' | 'resume') {
    setBusy(true); setError('');
    try { await api(`jobs/${job.id}/${name}`, undefined, 'POST'); await onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : '요청 실패'); }
    finally { setBusy(false); }
  }
  if(isVoiceInput(job.input))return null;
  return <article className="panel job-card"><div className="job-heading"><h2>{labels[job.state]}</h2><time>{new Date(job.createdAt).toLocaleString('ko-KR')}</time></div>
    {image ? artifact?.mediaType==='video/mp4' ? <video src={image} controls preload="metadata" aria-label="영상 결과 플레이어" className="generated-image" /> : <img src={image} alt="생성 결과" className="generated-image" /> : <div className="result-placeholder"><ImageIcon size={34} /><span>{job.state === 'completed' ? '결과 불러오는 중' : labels[job.state]}</span></div>}
    {job.artifacts.length>1&&<label>결과 프레임<select value={frameIndex} onChange={e=>setFrameIndex(Number(e.target.value))}>{job.artifacts.map((a,i)=><option key={a.id} value={i}>프레임 {i+1}</option>)}</select></label>}
    {job.progress !== null && <div className="sampler-progress"><label htmlFor={`progress-${job.id}`}>{localVideo?'작업 완료율':'샘플러 진행률'} {job.progress}%</label><progress id={`progress-${job.id}`} value={job.progress} max={100} /><small>{localVideo?'미디어 검증과 저장이 완료되면 100%로 표시합니다.':'전체 소요 시간의 비율이 아닙니다. 샘플링 후 디코딩·저장이 진행됩니다.'}</small></div>}
    {isKreaInput(job.input) && job.input.enhancer === 'engine' && <p className="field-help">{job.effectivePrompt ? '아래는 엔진 확장 후 실제 생성 프롬프트입니다.' : '아래는 엔진 확장 전 입력입니다. 생성 완료 후 확장 결과를 표시합니다.'}</p>}<p className="job-prompt">{localVideo?'FFmpeg 미디어 처리':job.effectivePrompt ?? job.input.prompt}</p><p className="field-help">{job.input.profile} · {job.input.width} × {job.input.height}{localVideo&&isVideoInput(job.input)?` · ${job.input.frames}프레임 · ${job.input.fps}FPS`:` · 시드 ${job.input.seed}`}</p>
    {(error || job.error || imageError) && <div className="notice error" role="alert">{error || job.error || imageError}</div>}
    <div className="form-actions">
      {image && <a className="primary-button" href={image} download={artifact.fileName}><Download size={15} />{artifact.mediaType==='video/mp4'?'MP4':'PNG'} 다운로드</a>}
      <button className="secondary-button" onClick={() => reuse(job.input)}>설정 재사용</button>
      {['preparing','queued','running'].includes(job.state) && <button className="secondary-button" disabled={busy} onClick={() => void action('cancel')}><Square size={13} />작업 취소</button>}
      {['unknown','interrupted'].includes(job.state) && <button className="secondary-button" disabled={busy} onClick={() => void action('resume')}><RefreshCw size={14} />상태 추적 재개</button>}
    </div><details className="job-log"><summary>생성 설정 및 작업 로그</summary><dl><dt>체크포인트</dt><dd>{job.input.checkpoint}</dd><dt>Negative</dt><dd>{job.input.negative || '없음'}</dd><dt>스텝 / CFG</dt><dd>{job.input.steps} / {job.input.cfg}</dd>{!isKreaInput(job.input)&&!isVideoInput(job.input)&&<>{job.input.profile==='anima'&&<><dt>텍스트 인코더 / VAE</dt><dd>{job.input.textEncoder} / {job.input.vae}</dd></>}<dt>LoRA 설정</dt><dd>{job.input.loras?.length?job.input.loras.map((l,i)=><div key={i}>{l.enabled?'활성':'비활성'} · {l.name} · {l.strength} · {l.profile}</div>):'없음'}</dd></>}{isKreaInput(job.input) && <><dt>텍스트 인코더 / VAE</dt><dd>{job.input.textEncoder} / {job.input.vae}</dd><dt>확장 방식 / 원문</dt><dd>{job.input.enhancer} / {job.input.sourcePrompt}</dd><dt>LoRA</dt><dd>{job.input.lora ? `${job.input.lora.name} · ${job.input.lora.strength} · ${job.input.lora.trigger}` : '없음'}</dd></>}{isVideoInput(job.input)&&<><dt>영상 모드 / 프레임 / FPS</dt><dd>{job.input.mode} / {job.input.frames} / {job.input.fps}</dd><dt>원본 / 시작 / 비율 / 보간</dt><dd>{job.input.sourceId??'없음'} / {job.input.startSeconds}초 / {job.input.fit} / {job.input.interpolation}</dd><dt>CPU 인코더 / denoise / 오디오</dt><dd>{String(job.input.lowVram)} / {job.input.denoise} / {String(job.input.includeAudio)}</dd></>}<dt>엔진 작업 ID</dt><dd>{job.promptId ?? '제출 전'}</dd></dl><pre>{job.log.join('\n')}</pre></details>
  </article>;
}
