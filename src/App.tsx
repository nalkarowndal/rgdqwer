import { KreaStudio, initialKreaDraft } from './KreaStudio';
import { isKreaInput } from './krea';
import { AnalysisStudio } from './AnalysisStudio';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight, AudioLines, Box, Check, ChevronRight, CircleHelp, Cpu, Database,
  Film, FolderClock, Home, Image, Layers, LoaderCircle, Plug, RefreshCw,
  ScanLine, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sparkles, WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { api } from './api';
import { PromptStudio, type PromptDraft } from './PromptStudio';
import { compilePrompt, createPromptDocument, documentFromRaw } from './prompt';
import { ImageStudio, JobHistory, initialDraft } from './ImageStudio';
import type { GenerationInput } from './contracts';
import type { EngineStatus, Job, Settings, WorkerStatus } from './contracts';

const sections: { id: string; title: string; icon: LucideIcon; phase?: string; description?: string }[] = [
  { id: 'home', title: '홈 / 대시보드', icon: Home },
  { id: 'image', title: '이미지 스튜디오', icon: Image, phase: 'M1', description: '텍스트에서 시작하는 새로운 장면' },
  { id: 'video', title: '영상 스튜디오', icon: Film, phase: 'M5', description: '한 장의 아이디어를 움직이는 이야기로' },
  { id: 'voice', title: 'AI 음성 스튜디오', icon: AudioLines, phase: 'M6', description: '텍스트와 목소리로 완성하는 이야기' },
  { id: 'krea', title: 'Krea 2 스튜디오', icon: Sparkles, phase: 'M4', description: 'RAW · Turbo 전용 제작 공간' },
  { id: 'prompt', title: '프롬프트 스튜디오', icon: WandSparkles, phase: 'M2', description: '생각을 모델이 이해할 수 있는 문장으로' },
  { id: 'caption', title: 'Image to Prompt', icon: ScanLine, phase: 'M3', description: '이미지를 읽고 새로운 프롬프트로' },
  { id: 'models', title: '모델·확장 관리자', icon: Box, phase: 'M7' },
  { id: 'library', title: '작업 기록 / 라이브러리', icon: FolderClock },
  { id: 'settings', title: '설정', icon: SettingsIcon },
];
const gib = (bytes: number | null | undefined) => bytes == null ? '확인 전' : `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';

export default function App() {
  const [page, setPage] = useState('home');
  const [settings, setSettings] = useState<Settings>();
  const [engine, setEngine] = useState<EngineStatus>();
  const [worker, setWorker] = useState<WorkerStatus>();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [kreaDraft, setKreaDraft] = useState(initialKreaDraft);
  const [imageDraft, setImageDraft] = useState(initialDraft);
  const refreshJobs = useCallback(async () => { setJobs(await api<Job[]>('jobs')); }, []);
  const [promptDraft, setPromptDraft] = useState<PromptDraft>({ profile: 'sd15', document: createPromptDocument() });
  function reuse(input: GenerationInput) {
    if (isKreaInput(input)) { setKreaDraft({ ...input, seed: String(input.seed) }); setPage('krea'); return; }
    setImageDraft({ ...input, seed: String(input.seed), promptDocument: input.promptDocument ? { ...input.promptDocument, editedPositive: input.prompt, editedNegative: input.negative } : documentFromRaw(input.prompt, input.negative) }); setPage('image');
  }
  function sendPrompt(next = promptDraft) {
    setImageDraft(value => ({ ...value, profile: next.profile, promptDocument: { ...next.document },
      ...(value.profile !== next.profile ? { width: next.profile === 'sd15' ? 512 : 1024, height: next.profile === 'sd15' ? 512 : 1024 } : {}) }));
    setPage('image');
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const cancelRequests = useCallback(() => { sequence.current++; }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const [nextEngine, nextWorker] = await Promise.all([
        api<EngineStatus>('engine/status'), api<WorkerStatus>('worker/status'),
      ]);
      if (request === sequence.current) { setEngine(nextEngine); setWorker(nextWorker); }
    } catch (err) { if (request === sequence.current) setError(errorMessage(err)); }
    finally { if (request === sequence.current) setBusy(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([api<Settings>('settings'), api<Job[]>('jobs')])
      .then(([value, list]) => { if (active) { setSettings(value); setJobs(list); } })
      .catch(err => { if (active) setError(errorMessage(err)); });
    void refresh();
    const jobTimer = setInterval(() => { void api<Job[]>('jobs').then(value => { if (active) setJobs(value); }).catch(err => { if (active) setError(errorMessage(err)); }); }, 1000);
    const timer = setInterval(() => { void refresh(); }, 15000);
    return () => { active = false; cancelRequests(); clearInterval(timer); clearInterval(jobTimer); };
  }, [refresh, cancelRequests]);
  const current = sections.find(s => s.id === page)!;
  const connected = engine?.state === 'connected';
  const gpu = engine?.devices.find(device => ['cuda', 'mps', 'xpu', 'privateuseone'].includes(device.type));
  const deviceDescription = gpu?.name ?? (engine?.devices.some(device => device.type === 'cpu')
    ? 'CPU 모드 · GPU 메모리 측정 없음' : 'ComfyUI 연결 후 장치를 표시합니다');
  const statusLabel = !engine ? '확인 중' : connected ? '연결됨' : '연결 필요';
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setPage('home'); }}>
        <span className="brand-mark"><Layers size={24} /></span>
        <span>rgdqwer<small>LOCAL AI STUDIO</small></span>
      </a>
      <div className="workspace-label">나의 작업 공간 <span>LOCAL</span></div>
      <nav aria-label="주 내비게이션">
        {sections.map((section, index) => <div key={section.id}>
          {(index === 1 || index === 7) && <div className="nav-section">{index === 1 ? '스튜디오' : '워크스페이스'}</div>}
          <button className={`nav-item ${page === section.id ? 'active' : ''}`} aria-current={page === section.id ? 'page' : undefined}
            onClick={() => setPage(section.id)}>
            <section.icon size={18} /><span>{section.title}</span>
            {page === section.id && <span className="active-dot" />}
          </button>
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-note"><ShieldCheck size={17} /><span>로컬에서, 나만의 작업</span></div>
        <p>모델과 파일을 내 컴퓨터에서 관리합니다.</p>
        <div className="version">v0.5.0 <span>M4 · Krea 2</span></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb">워크스페이스 <ChevronRight size={14} /><strong>{current.title}</strong></div>
        <div className="top-actions"><span className={`status-pill ${connected ? 'connected' : ''}`}><i /> ComfyUI {statusLabel}</span>
          <button className="icon-button" title="연결 상태 새로고침" aria-label="연결 상태 새로고침" disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={17} className={busy ? 'spin' : ''} />
          </button>
        </div>
      </header>
      <main id="main">
        <div hidden={page !== 'caption'}><AnalysisStudio active={page === 'caption'} send={(next, target) => { if (target === 'image') sendPrompt(next); else if (target === 'krea') { const prompt = compilePrompt(next.document, next.profile).positive; setKreaDraft(value => ({ ...value, sourcePrompt: prompt, prompt, enhancer: 'none' })); setPage('krea'); } else { setPromptDraft(next); setPage('prompt'); } }} /></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {page === 'home' ? <>
          <div className="page-heading"><div><p className="eyebrow">YOUR LOCAL CREATIVE SPACE</p>
            <h1>당신의 아이디어,<br className="mobile-break" /> 당신의 컴퓨터에서.</h1>
            <p className="subtitle">이미지부터 영상, 목소리까지. 나만의 AI 작업 공간을 준비하세요.</p>
          </div><span className="milestone-tag">M4 KREA STUDIO</span></div>
          <section className="onboarding">
            <div className="onboarding-copy"><span className="hero-label"><Plug size={14} /> 처음 시작하시나요?</span>
              <h2>ComfyUI를 연결하고<br />창작할 준비를 시작하세요.</h2>
              <p>이미 설치한 ComfyUI에 연결하면<br />실행 상태와 사용 가능한 모델을 확인할 수 있습니다.</p>
              <button className="primary-button" onClick={() => setPage('settings')}>연결 설정 열기 <ArrowRight size={16} /></button>
            </div>
            <div className="connection-diagram" aria-label="스튜디오에서 로컬 ComfyUI로 연결">
              <div className="diagram-orbit orbit-one" /><div className="diagram-orbit orbit-two" />
              <div className="diagram-node studio-node"><Layers size={30} /><span>rgdqwer</span><small>나의 스튜디오</small></div>
              <div className="diagram-line"><span /><span /><span /></div>
              <div className="diagram-node engine-node"><Cpu size={30} /><span>ComfyUI</span><small>{statusLabel}</small></div>
              <span className="diagram-caption"><ShieldCheck size={13} /> 내 컴퓨터 안에서 연결</span>
            </div>
          </section>
          <div className="section-heading"><h2>작업 환경</h2><button className="text-button" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={13} className={busy ? 'spin' : ''} /> 상태 다시 확인</button></div>
          <section className="status-grid" aria-label="작업 환경 상태">
            <StatusCard icon={Plug} label="생성 엔진" value={`ComfyUI ${statusLabel}`} detail={settings?.comfyUrl ?? '설정 불러오는 중'} tone={connected ? 'good' : 'waiting'} />
            <StatusCard icon={Cpu} label="GPU 메모리" value={gib(gpu?.vramTotal)} detail={deviceDescription} />
            <StatusCard icon={Box} label="SD 체크포인트" value={connected ? `${engine.checkpoints.length}개 확인됨` : '확인 전'} detail="CheckpointLoaderSimple 기준" />
            <StatusCard icon={AudioLines} label="Python Worker" value={!worker ? '확인 중' : worker.state === 'connected' ? '연결됨' : '연결 필요'} detail="독립 실행 · 진단 / 선택형 이미지 분석" />
          </section>
          {engine && !connected && <div className="notice" role="status"><CircleHelp size={17} /><span>{engine.message}</span></div>}
          <div className="section-heading"><div><h2>무엇을 만들어 볼까요?</h2><p>공통 기반을 먼저 준비하고, 단계별로 기능을 연결합니다.</p></div><span className="subtle-label">이미지 T2I 지원 · 나머지 단계별 제공</span></div>
          <section className="studio-grid">
            {sections.slice(1, 7).map((section, index) => <button key={section.id} className="studio-card" onClick={() => setPage(section.id)}>
              <div className={`studio-icon tone-${index}`}><section.icon size={24} /></div>
              <span className="phase-chip">{section.id === 'image' ? 'T2I 지원' : section.id === 'prompt' ? '편집 지원' : section.id === 'caption' ? '로컬 분석' : section.id === 'krea' ? 'RAW · Turbo' : `${section.phase} 예정`}</span>
              <h3>{section.title}</h3><p>{section.description}</p>
              <span className="card-link">개발 범위 보기 <ArrowRight size={15} /></span>
            </button>)}
          </section>
          <section className="recent-section"><div className="section-heading"><h2>최근 작업</h2><button className="text-button" onClick={() => setPage('library')}>라이브러리 열기 <ArrowRight size={14} /></button></div>
            <div className="empty-inline"><FolderClock size={27} /><div><strong>{jobs.length ? `최근 작업 ${jobs.length}개` : '아직 생성한 작업이 없습니다'}</strong><p>라이브러리에서 결과와 설정을 다시 찾을 수 있어요.</p></div><span>이미지 기록</span></div>
          </section>
        </> : page === 'settings' ? <SettingsPanel settings={settings} onSaved={value => { setSettings(value); void refresh(); }} engine={engine} busy={busy} refresh={refresh} />
          : page === 'image' ? <ImageStudio engine={engine} jobs={jobs} draft={imageDraft} setDraft={setImageDraft} onChanged={refreshJobs} reuse={reuse} />
          : page === 'krea' ? <KreaStudio draft={kreaDraft} setDraft={setKreaDraft} jobs={jobs} onChanged={refreshJobs} reuse={reuse} />
          : page === 'prompt' ? <PromptStudio draft={promptDraft} setDraft={setPromptDraft} send={() => sendPrompt()} />
          : page === 'caption' ? null
          : page === 'library' ? <JobHistory jobs={jobs} onChanged={refreshJobs} reuse={reuse} />
          : page === 'models' ? <><PageTitle title={current.title} text="현재 연결한 ComfyUI의 SD 체크포인트를 읽기 전용으로 확인합니다." />
            <ModelList engine={engine} /><div className="notice"><CircleHelp size={18} />다운로드·설치·삭제와 LoRA 관리는 M7에서 제공됩니다. 자동 설치는 실행하지 않습니다.</div></>
          : <><PageTitle title={current.title} text={current.description ?? ''} />
            <div className="panel feature-detail"><span className="phase-chip">{current.phase} 개발 예정</span><current.icon size={42} />
              <h2>다음 창작 도구를 준비하고 있습니다.</h2>
              <p>현재는 M4 Krea 2 구현 단계입니다. 이 카테고리의 AI 생성 기능은 아직 구현되지 않았습니다.</p>
              {page === 'krea' && <div className="notice">8GB 실행 가능 여부는 실기 검증 전입니다.</div>}
              <p className="feature-note">{({
                video: 'Wan 계열의 해상도·프레임·오프로딩 조건을 실기 검증합니다.',
                voice: '독립 Worker에서 TTS와 Voice Conversion을 단계별로 추가합니다.',
                krea: 'RAW/Turbo 워크플로와 메모리·라이선스를 확인한 뒤 선택적으로 연결합니다.',
                prompt: '규칙 기반 한국어 입력과 모델별 프롬프트 어댑터부터 구현합니다.',
                caption: '이미지를 기반으로 재구성한 프롬프트를 편집하도록 구현합니다.',
              } as Record<string, string>)[page]}</p>
              <button className="primary-button" disabled>{`${current.phase}에서 제공 예정`}</button>
            </div></>}
        <footer><span>rgdqwer · 로컬 AI 스튜디오</span><span>실행 가능 여부는 연결된 엔진과 모델에 따라 달라집니다.</span></footer>
      </main>
    </div>
  </div>;
}

function PageTitle({ title, text }: { title: string; text: string }) {
  return <div className="page-heading"><div><p className="eyebrow">LOCAL AI STUDIO</p><h1>{title}</h1><p className="subtitle">{text}</p></div></div>;
}
function StatusCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string; detail: string; tone?: string }) {
  return <div className="status-card"><div className="status-label"><Icon size={16} />{label}</div><strong className={tone}>{value}</strong><p title={detail}>{detail}</p></div>;
}
function ModelList({ engine }: { engine?: EngineStatus }) {
  return <section className="panel model-list"><h2><Box size={19} /> 연결된 체크포인트</h2>
    {engine?.state !== 'connected' ? <p>ComfyUI를 연결하면 설치된 모델 목록이 표시됩니다.</p>
      : engine.checkpoints.length ? <ul>{engine.checkpoints.map(model => <li key={model}><Database size={16} />{model}<span>발견됨 · 호환성 검증 전</span></li>)}</ul>
        : <p>SD 체크포인트를 찾지 못했습니다. ComfyUI 모델 폴더를 확인하세요.</p>}
  </section>;
}
function SettingsPanel({ settings, onSaved, engine, busy, refresh }: {
  settings?: Settings; onSaved: (settings: Settings) => void; engine?: EngineStatus; busy: boolean; refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setDraft(settings); }, [settings]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await api<Settings>('settings', draft);
      onSaved(result); setMessage('설정을 저장했습니다. 저장된 주소로 연결 상태를 확인합니다.');
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }
  return <><PageTitle title="설정" text="내 컴퓨터의 생성 엔진과 작업 환경을 연결하세요." />
    {!draft ? <div className="panel">설정 불러오는 중…</div> : <form onSubmit={event => void save(event)} className="settings-layout">
      <div className="panel settings-panel"><div className="panel-title"><Plug size={21} /><div><h2>엔진 연결</h2><p>같은 PC에서 실행 중인 서비스에 연결합니다.</p></div></div>
        <label htmlFor="comfy-url">ComfyUI 서버 주소</label>
        <input id="comfy-url" type="url" required value={draft.comfyUrl} disabled={saving} onChange={e => setDraft({ ...draft, comfyUrl: e.target.value })} aria-describedby="comfy-help" />
        <p id="comfy-help" className="field-help">기본값 http://127.0.0.1:8188 · ComfyUI를 먼저 실행하세요.</p>
        <label htmlFor="worker-url">Python Worker 서버 주소</label>
        <input id="worker-url" type="url" required value={draft.workerUrl} disabled={saving} onChange={e => setDraft({ ...draft, workerUrl: e.target.value })} />
        <p className="field-help">기본값 http://127.0.0.1:8189 · Worker는 별도 Python 환경에서 실행합니다.</p>
        <details><summary><SlidersHorizontal size={16} /> 경로 및 저VRAM 환경 설정</summary>
          <div className="notice">경로와 저VRAM 선호값을 저장합니다. 현재 ComfyUI 실행 옵션이나 모델 경로에 자동 적용되지 않습니다.</div>
          <label htmlFor="comfy-path">ComfyUI 설치 경로 (참조용)</label>
          <input id="comfy-path" value={draft.comfyPath} disabled={saving} placeholder="예: D:\AI\ComfyUI" onChange={e => setDraft({ ...draft, comfyPath: e.target.value })} />
          <label htmlFor="model-path">모델 경로 (참조용)</label>
          <input id="model-path" value={draft.modelPath} disabled={saving} placeholder="예: D:\AI\models" onChange={e => setDraft({ ...draft, modelPath: e.target.value })} />
          <label className="checkbox-label"><input type="checkbox" checked={draft.lowVram} disabled={saving} onChange={e => setDraft({ ...draft, lowVram: e.target.checked })} />저VRAM 실행 선호값 저장</label>
        </details>
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice success" role="status"><Check size={17} />{message}</div>}
        <div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}설정 저장</button>
          <button type="button" className="secondary-button" disabled={busy || saving} onClick={() => void refresh()}>저장된 주소 연결 검사</button></div>
      </div>
      <aside className="panel setup-guide"><span className="guide-icon"><CircleHelp size={25} /></span><h2>연결 전에 확인하세요</h2>
        <ol><li>기존 ComfyUI를 실행합니다.</li><li>콘솔에 표시된 포트를 확인합니다.</li><li>주소를 입력하고 저장합니다.</li></ol>
        <p>이 앱은 ComfyUI나 모델을 자동 설치하지 않습니다. 네트워크 주소 대신 127.0.0.1을 사용하세요.</p>
        <div className="guide-status"><strong>최근 연결 결과</strong><p>{engine?.message ?? '연결 확인 중…'}</p>
          {engine?.checkedAt && <small>{new Date(engine.checkedAt).toLocaleTimeString('ko-KR')}</small>}</div>
      </aside>
    </form>}
  </>;
}
