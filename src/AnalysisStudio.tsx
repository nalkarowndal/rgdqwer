import { useEffect, useRef, useState } from 'react';
import { ScanLine, RefreshCw, ArrowRight, LockKeyhole } from 'lucide-react';
import { api, ApiError } from './api';
import { analysisFields, analysisLabels, createAnalysisDraft, mergeAnalysis, toPromptDocument,
  type AnalysisModel, type AnalysisStatus, type AnalysisResult } from './analysis';
import { compilePrompt, profiles, type PromptProfile } from './prompt';
import type { PromptDraft } from './PromptStudio';

export function AnalysisStudio({ send, active }: { send: (draft: PromptDraft, target: 'image'|'prompt'|'krea') => void; active: boolean }) {
  const [draft,setDraft] = useState(createAnalysisDraft);
  const [profile,setProfile] = useState<PromptProfile>('sd15');
  const [model,setModel] = useState<AnalysisModel>('florence');
  const [status,setStatus] = useState<AnalysisStatus>();
  const [tokenFile,setTokenFile] = useState('');
  const [source,setSource] = useState<{name:string;data:string}>();
  const [result,setResult] = useState<AnalysisResult>();
  const [busy,setBusy] = useState(false);
  const [reading,setReading] = useState(false);
  const [checking,setChecking] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const selection = useRef(0);
  const currentDraft = useRef(draft);
  useEffect(()=>{ currentDraft.current = draft; },[draft]);
  const document = toPromptDocument(draft,profile);
  const compiled = compilePrompt(document,profile);
  const required = model === 'both' ? ['florence','wd14'] : [model];
  const ready = status && required.every(id => status.models.some(m=>m.id===id && m.available));
  async function refresh() {
    setChecking(true); setError('');
    try { const value = await api<AnalysisStatus>('analysis/status'); setStatus(value); setTokenFile(value.tokenFile); }
    catch (err) { setStatus(undefined); setError(err instanceof Error ? err.message : 'Worker 상태 확인 실패'); if (err instanceof ApiError && err.tokenFile) setTokenFile(err.tokenFile); }
    finally { setChecking(false); }
  }
  // Kept mounted by App: navigating elsewhere never drops an in-flight draft.
  useEffect(()=> { if (active) void refresh(); },[active]);
  async function choose(file?: File) {
    if (!file) return;
    const id = ++selection.current; setReading(true); setError(''); setNotice('');
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5*1024*1024) throw new Error('PNG/JPEG/WebP 파일을 선택하세요. 최대 5 MiB입니다.');
      const data = await new Promise<string>((resolve,reject)=> { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error('이미지 파일을 읽지 못했습니다.')); reader.readAsDataURL(file); });
      if (id !== selection.current) return;
      setSource({name:file.name,data});
      setNotice('새 이미지를 선택했습니다. 분석을 실행하면 잠금과 현재 편집 내용을 기준으로 결과를 갱신합니다.');
    } catch (err) { if (id === selection.current) setError(err instanceof Error ? err.message : '파일 읽기 실패'); }
    finally { if (id === selection.current) setReading(false); }
  }
  async function analyze() {
    if (!source || busy) return;
    const started = currentDraft.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const value = await api<AnalysisResult>('analysis',{image:source.data.split(',')[1],model},'POST',310000);
      setDraft(current=>mergeAnalysis(current,started,value)); setResult(value);
      setNotice('분석 결과를 적용했습니다. 잠긴 값과 분석 도중 수정한 값은 유지했습니다.');
    } catch (err) { setError(err instanceof Error ? err.message : '분석 실패'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><p className="eyebrow">READ · REFINE · CREATE</p><h1>Image to Prompt</h1><p className="subtitle">이미지를 읽고, 필요한 부분을 바꾸고, 새로운 장면으로.</p></div><span className="milestone-tag">M3 · LOCAL ANALYSIS</span></div>
    <div className="notice">이미지를 기반으로 재구성한 프롬프트입니다. 원본 프롬프트를 복원하지 않으며, 분석에는 오류가 있을 수 있습니다.</div>
    <div className="analysis-layout">
      <section className="panel analysis-source"><h2><ScanLine size={20}/> 이미지 분석</h2>
        <label htmlFor="analysis-file">분석할 이미지</label><input id="analysis-file" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || reading} onChange={e=>void choose(e.target.files?.[0])}/>
        <p className="field-help">PNG · JPEG · WebP / 5 MiB / 16 MP / 한 변 8192 이하 · 움직이는 이미지 제외</p>
        {source ? <figure className="analysis-preview"><img src={source.data} alt="분석할 원본 이미지"/><figcaption>{source.name}</figcaption></figure> : <div className="analysis-empty"><ScanLine size={36}/><p>분석할 이미지를 선택하세요.</p></div>}
        <label htmlFor="analysis-model">분석 모델</label><select id="analysis-model" value={model} disabled={busy} onChange={e=>setModel(e.target.value as AnalysisModel)}><option value="florence">Florence-2 · 캡션 + OCR</option><option value="wd14">WD14 · 태그</option><option value="both">Florence-2 + WD14</option></select>
        <div className="analysis-models">{status?.models.map(item=><div key={item.id}><strong>{item.id==='florence'?'Florence-2':'WD14'} · {item.available?'파일 발견':'준비 필요'}</strong><p className="field-help">{item.reason}</p></div>)}</div>
        <p className="field-help">CPU에서 한 번에 하나씩 분석합니다. 큰 모델은 오래 걸릴 수 있습니다. 파일 발견은 추론 성공을 뜻하지 않습니다.</p>
        <div className="form-actions"><button type="button" className="primary-button" disabled={!source || !ready || busy || reading || !!status?.busy} onClick={()=>void analyze()}><ScanLine size={16}/>{busy?'분석 중…':'이미지 분석'}</button>
          <button type="button" className="secondary-button" disabled={checking || busy} onClick={()=>void refresh()}><RefreshCw size={15}/>분석 상태 확인</button></div>
        {status?.busy && <p role="status">Worker에서 분석 중입니다. 종료 후 상태를 다시 확인하세요.</p>}
        <details className="analysis-setup" open={!ready}><summary>로컬 모델 연결 방법</summary><p>앱을 먼저 실행한 뒤 독립 Python 환경에서 Worker를 시작하세요. 모델은 자동 다운로드하지 않습니다.</p>
          <p>이 앱의 토큰 파일: <code>{tokenFile || '상태 확인 후 표시됩니다.'}</code></p>
          <code>python -m worker.run --token-file "위 경로" --florence-dir "모델 폴더" --wd14-dir "태거 폴더"</code>
          <p className="field-help">Florence: native 변환 체크포인트 + safetensors. WD14: model.onnx + selected_tags.csv. 패키지 설치와 Windows 실행법은 저장소의 docs/IMAGE_TO_PROMPT.md를 참고하세요.</p></details>
      </section>
      <section className="panel analysis-editor"><h2><LockKeyhole size={20}/> 분석 결과 다듬기</h2><p className="field-help">확인하지 못한 항목은 비워 둡니다. 태그의 필드 분류는 제한된 사전 규칙이며, 캡션은 전체 설명에 남깁니다. 잠금은 재분석 시 유지할 값을 선택합니다.</p>
        {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
        <div className="analysis-fields">{analysisFields.map(key=><div key={key} className={key==='caption'||key==='other'||key==='ocr'?'analysis-wide':''}>
          <div className="analysis-label"><label htmlFor={`analysis-${key}`}>{analysisLabels[key]}</label><label className="checkbox-label"><input type="checkbox" aria-label={`${analysisLabels[key]} 잠금`} checked={draft.locked[key]} onChange={e=>setDraft(value=>({...value,locked:{...value.locked,[key]:e.target.checked}}))}/>잠금</label></div>
          <textarea id={`analysis-${key}`} aria-label={`분석 ${analysisLabels[key]}`} rows={key==='caption'?3:2} maxLength={key==='other'?8000:key==='caption'||key==='ocr'?4000:600} placeholder="미확인 · 직접 입력할 수 있습니다" value={draft.values[key]} onChange={e=>setDraft(value=>({...value,values:{...value.values,[key]:e.target.value}}))}/>
        </div>)}</div>
        {result && <details><summary>최근 분석 원문 · 출처와 점수</summary><p>{result.models.join(' + ')} · {result.width} × {result.height}</p><p className="field-help">캡션/OCR 신뢰도는 제공되지 않습니다. WD14 점수는 모델 출력이며 정확할 확률이 아닙니다. 캐릭터 태그는 추정 이름입니다.</p><p className="analysis-raw">{result.caption}</p><p className="analysis-raw">OCR: {result.ocr || '추출된 텍스트 없음'}</p><ul className="analysis-tags">{result.tags.map((tag,index)=><li key={`${tag.name}-${index}`}>{tag.name} <small>{tag.category==='character'?'캐릭터 추정 · ':''}{tag.score.toFixed(3)}</small></li>)}</ul></details>}
        <label htmlFor="analysis-profile">사용할 생성 모델 프로필</label><select id="analysis-profile" value={profile} onChange={e=>setProfile(e.target.value as PromptProfile)}>{Object.entries(profiles).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}</select>
        <label className="checkbox-label"><input type="checkbox" checked={draft.includeCaption} onChange={e=>setDraft(value=>({...value,includeCaption:e.target.checked}))}/>전체 설명을 프롬프트에 포함</label>
        <p className="field-help">필드를 바꿨다면 전체 설명과 모순되는지 확인하세요. 필요하면 전체 설명도 수정하거나 포함을 해제하세요.</p>
        <label className="checkbox-label"><input type="checkbox" checked={draft.includeOcr} onChange={e=>setDraft(value=>({...value,includeOcr:e.target.checked}))}/>OCR 텍스트를 프롬프트에 포함</label>
        <label htmlFor="analysis-output">재구성 프롬프트</label><textarea id="analysis-output" rows={5} readOnly value={compiled.positive}/><p className="field-help">{compiled.positive.length} / 8,000자 · 최종 문장은 보내기 후 프롬프트 편집기에서 직접 수정할 수 있습니다.</p>
        {compiled.warnings.map(message=><p className="notice" key={message}>{message}</p>)}
        <div className="form-actions"><button className="primary-button" disabled={!compiled.valid || busy} onClick={()=>send({profile,document},'image')}>이미지 스튜디오에 적용 <ArrowRight size={16}/></button><button className="secondary-button" disabled={!compiled.valid || busy} onClick={()=>send({profile,document},'prompt')}>프롬프트 스튜디오에 적용</button><button className="secondary-button" disabled={!compiled.valid || busy} onClick={()=>send({profile,document},'krea')}>Krea 2 스튜디오에 적용</button></div>
        <p className="field-help">보내면 대상 화면의 현재 프롬프트를 바꿉니다. 생성은 해당 화면에서 실행하세요. 이미지·분석 초안은 앱 내 이동 시 유지되며 새로고침하면 사라집니다. 필요한 문장은 프롬프트 스튜디오에서 프리셋으로 저장하세요.</p>
      </section>
    </div>
  </>;
}
