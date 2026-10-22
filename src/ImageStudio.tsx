import { useEffect, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react';
import { Download, Image as ImageIcon, RefreshCw, Square, WandSparkles } from 'lucide-react';
import { PromptEditor } from './PromptEditor';
import { compilePrompt, createPromptDocument, type PromptDocument } from './prompt';
import { api, artifactBlob } from './api';
import type { EngineStatus, ImageInput, Job } from './contracts';

export type ImageDraft = Omit<ImageInput, 'seed' | 'prompt' | 'negative' | 'promptDocument'> & { seed: string; promptDocument: PromptDocument };
export const initialDraft: ImageDraft = { profile: 'sd15', checkpoint: '', promptDocument: createPromptDocument(), width: 512, height: 512, seed: '', steps: 20, cfg: 7 };
const labels: Record<Job['state'], string> = { preparing: '준비 중', queued: '대기 중', running: '생성 중', cancelling: '취소 확인 중', postprocessing: '결과 저장 중', completed: '완료', failed: '실패', cancelled: '취소됨', interrupted: '추적 중단', unknown: '상태 미확인' };
export const isPending = (job: Job) => !['completed','failed','cancelled'].includes(job.state);

export function ImageStudio({ engine, jobs, draft, setDraft, onChanged, reuse }: {
  engine?: EngineStatus; jobs: Job[]; draft: ImageDraft; setDraft: Dispatch<SetStateAction<ImageDraft>>;
  onChanged: () => Promise<void>; reuse: (input: ImageInput) => void;
}) {
  const [sending, setSending] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    if (!draft.checkpoint && engine?.checkpoints[0]) setDraft(value => ({ ...value, checkpoint: engine.checkpoints[0] }));
  }, [engine, draft.checkpoint, setDraft]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setError('');
    try {
      const seed = draft.seed.trim() ? Number(draft.seed) : crypto.getRandomValues(new Uint32Array(1))[0];
      const result = compilePrompt(draft.promptDocument, draft.profile);
      await api<Job>('jobs', { ...draft, seed, prompt: result.positive, negative: result.negative }, 'POST'); await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : '생성 요청 실패'); }
    finally { setSending(false); }
  }
  const ready = engine?.state === 'connected' && engine.checkpoints.includes(draft.checkpoint);
  const pending = jobs.some(isPending);
  const maximum = draft.profile === 'sd15' ? 768 : 1024;
  return <><div className="page-heading"><div><p className="eyebrow">TEXT TO IMAGE</p><h1>이미지 스튜디오</h1><p className="subtitle">내 ComfyUI의 체크포인트로 이미지를 생성하고 설정을 함께 보관합니다.</p></div><span className="milestone-tag">M2 · 배치 1</span></div>
    <div className="image-layout"><form className="panel settings-panel image-form" onSubmit={event => void submit(event)}>
      <h2><WandSparkles size={19} /> 새로운 이미지</h2>
      <label htmlFor="model-profile">모델 프로필</label>
      <select id="model-profile" value={draft.profile} onChange={e => { const profile = e.target.value as ImageInput['profile']; setDraft({ ...draft, profile, width: profile === 'sd15' ? 512 : 1024, height: profile === 'sd15' ? 512 : 1024, cfg: profile === 'sd15' ? 7 : 5, steps: profile === 'sd15' ? 20 : 25 }); }}>
        <option value="sd15">SD 1.5</option><option value="sdxl">SDXL</option><option value="illustrious">Illustrious / WAI-Illustrious</option>
      </select><p className="field-help">파일명으로 계열을 판별하지 않습니다. 모델 설명에 맞는 프로필을 선택하세요. Anima·Krea는 이 워크플로에서 지원하지 않습니다.</p>
      <label htmlFor="checkpoint">체크포인트</label><select id="checkpoint" value={draft.checkpoint} onChange={e => setDraft({ ...draft, checkpoint: e.target.value })}>
        <option value="">모델을 선택하세요</option>{engine?.checkpoints.map(name => <option key={name}>{name}</option>)}
        {draft.checkpoint && !engine?.checkpoints.includes(draft.checkpoint) && <option value={draft.checkpoint}>{draft.checkpoint} · 현재 찾을 수 없음</option>}
      </select>
      <PromptEditor document={draft.promptDocument} profile={draft.profile} onChange={promptDocument => setDraft(value => ({ ...value, promptDocument }))} />
      <details><summary>상세 생성 설정</summary><div className="parameter-grid">
        <div><label htmlFor="width">가로 (px)</label><input id="width" type="number" min={256} max={maximum} step={64} required value={draft.width} onChange={e => setDraft({ ...draft, width: Number(e.target.value) })} /></div>
        <div><label htmlFor="height">세로 (px)</label><input id="height" type="number" min={256} max={maximum} step={64} required value={draft.height} onChange={e => setDraft({ ...draft, height: Number(e.target.value) })} /></div>
        <div><label htmlFor="steps">스텝</label><input id="steps" type="number" min={1} max={80} required value={draft.steps} onChange={e => setDraft({ ...draft, steps: Number(e.target.value) })} /></div>
        <div><label htmlFor="cfg">CFG</label><input id="cfg" type="number" min={1} max={30} step={0.5} required value={draft.cfg} onChange={e => setDraft({ ...draft, cfg: Number(e.target.value) })} /></div>
      </div><label htmlFor="seed">시드 (비우면 무작위)</label><input id="seed" type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} value={draft.seed} onChange={e => setDraft({ ...draft, seed: e.target.value })} />
        <p className="field-help">시드는 결과와 함께 저장합니다. 샘플러 euler · 스케줄러 normal · 배치 1 고정.</p>
      </details>
      <div className="notice">8GB에서 모델별 안정성은 실기 검증 전입니다. 메모리 오류 시 해상도를 낮추세요. 안전 취소는 최신 ComfyUI의 작업별 취소 API가 필요합니다.</div>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="primary-button generate-button" disabled={sending || pending || !ready || !compilePrompt(draft.promptDocument, draft.profile).valid}><ImageIcon size={16} />{sending ? '요청 중…' : '이미지 생성'}</button>
      {!ready && <p className="field-help">설정에서 ComfyUI를 연결하고 설치된 체크포인트를 선택하세요.</p>}
      {pending && <p className="field-help">기존 작업의 실행 또는 상태 확인이 끝난 뒤 새로 생성할 수 있습니다.</p>}
    </form><section className="image-result" aria-label="현재 작업">
      {jobs[0] ? <JobCard key={jobs[0].id} job={jobs[0]} onChanged={onChanged} reuse={reuse} /> : <div className="panel empty-state"><ImageIcon size={42} /><h2>첫 이미지를 만들어 보세요</h2><p>생성 결과와 진행 상태가 여기에 표시됩니다.</p></div>}
    </section></div></>;
}
export function JobHistory({ jobs, onChanged, reuse }: { jobs: Job[]; onChanged: () => Promise<void>; reuse: (input: ImageInput) => void }) {
  return <><div className="page-heading"><div><p className="eyebrow">YOUR CREATIONS</p><h1>작업 기록 / 라이브러리</h1><p className="subtitle">최근 20개 작업 · 생성 설정과 저장된 PNG를 다시 사용할 수 있습니다.</p></div></div>
    {jobs.length ? <div className="history-grid">{jobs.slice(0,20).map(job => <JobCard key={job.id} job={job} onChanged={onChanged} reuse={reuse} />)}</div> : <div className="panel empty-state"><h2>저장된 작업이 없습니다</h2><p>이미지 스튜디오에서 첫 생성을 시작하세요.</p></div>}</>;
}
function JobCard({ job, onChanged, reuse }: { job: Job; onChanged: () => Promise<void>; reuse: (input: ImageInput) => void }) {
  const [image, setImage] = useState(''); const [imageError, setImageError] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const artifact = job.artifacts[0]; const artifactId = artifact?.id;
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
  return <article className="panel job-card"><div className="job-heading"><h2>{labels[job.state]}</h2><time>{new Date(job.createdAt).toLocaleString('ko-KR')}</time></div>
    {image ? <img src={image} alt="생성 결과" className="generated-image" /> : <div className="result-placeholder"><ImageIcon size={34} /><span>{job.state === 'completed' ? '결과 불러오는 중' : labels[job.state]}</span></div>}
    {job.progress !== null && <div className="sampler-progress"><label htmlFor={`progress-${job.id}`}>샘플러 진행률 {job.progress}%</label><progress id={`progress-${job.id}`} value={job.progress} max={100} /><small>전체 소요 시간의 비율이 아닙니다. 샘플링 후 디코딩·저장이 진행됩니다.</small></div>}
    <p className="job-prompt">{job.input.prompt}</p><p className="field-help">{job.input.profile} · {job.input.width} × {job.input.height} · 시드 {job.input.seed}</p>
    {(error || job.error || imageError) && <div className="notice error" role="alert">{error || job.error || imageError}</div>}
    <div className="form-actions">
      {image && <a className="primary-button" href={image} download={artifact.fileName}><Download size={15} />PNG 다운로드</a>}
      <button className="secondary-button" onClick={() => reuse(job.input)}>설정 재사용</button>
      {['preparing','queued','running'].includes(job.state) && <button className="secondary-button" disabled={busy} onClick={() => void action('cancel')}><Square size={13} />작업 취소</button>}
      {['unknown','interrupted'].includes(job.state) && <button className="secondary-button" disabled={busy} onClick={() => void action('resume')}><RefreshCw size={14} />상태 추적 재개</button>}
    </div><details className="job-log"><summary>생성 설정 및 작업 로그</summary><dl><dt>체크포인트</dt><dd>{job.input.checkpoint}</dd><dt>Negative</dt><dd>{job.input.negative || '없음'}</dd><dt>스텝 / CFG</dt><dd>{job.input.steps} / {job.input.cfg}</dd><dt>엔진 작업 ID</dt><dd>{job.promptId ?? '제출 전'}</dd></dl><pre>{job.log.join('\n')}</pre></details>
  </article>;
}
