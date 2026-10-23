import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react';
import { Sparkles, RefreshCw, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { api } from './api';
import { JobCard, isPending } from './ImageStudio';
import type { GenerationInput, Job } from './contracts';
import { isKreaInput, kreaInputSchema, kreaPresets, kreaStyles, prepareKreaPrompt, kreaIssues, kreaMemoryNotes, type KreaInput, type KreaStatus } from './krea';

export type KreaDraft = Omit<KreaInput,'seed'> & { seed: string };
export const initialKreaDraft:KreaDraft={profile:'krea-turbo',checkpoint:'',textEncoder:'',vae:'',sourcePrompt:'',prompt:'',negative:'',enhancer:'none',width:1024,height:1024,seed:'',steps:8,cfg:1,lora:null};
const gib=(v:number|null|undefined)=>v==null?'확인 전':`${(v/1024**3).toFixed(1)} GiB`;
const basename=(name:string)=>name.split(/[\\/]/).at(-1);
const recommended=(list:string[],name:string)=>list.find(n=>basename(n)===name)??'';
export function KreaStudio({draft,setDraft,jobs,onChanged,reuse}:{draft:KreaDraft;setDraft:Dispatch<SetStateAction<KreaDraft>>;jobs:Job[];onChanged:()=>Promise<void>;reuse:(input:GenerationInput)=>void}) {
  const [status,setStatus]=useState<KreaStatus>();const [error,setError]=useState('');const [checking,setChecking]=useState(false);const [sending,setSending]=useState(false);
  const request=useRef(0);
  const refresh=useCallback(async()=>{
    const id=++request.current;setChecking(true);setError('');
    try {const next=await api<KreaStatus>('krea/status');if(id!==request.current)return;setStatus(next);
      setDraft(value=>({...value,checkpoint:value.checkpoint||recommended(next.diffusionModels,`krea2_${value.profile==='krea-raw'?'raw':'turbo'}_fp8_scaled.safetensors`),
        textEncoder:value.textEncoder||recommended(next.textEncoders,'qwen3vl_4b_fp8_scaled.safetensors'),vae:value.vae||recommended(next.vaes,'qwen_image_vae.safetensors')}));
    } catch(err){if(id===request.current)setError(err instanceof Error?err.message:'진단 실패');}
    finally{if(id===request.current)setChecking(false);}
  },[setDraft]);
  const invalidate=useCallback(()=>{request.current++;},[]);
  useEffect(()=>{void refresh();return invalidate;},[refresh,invalidate]);
  const seed=draft.seed.trim()?Number(draft.seed):0;
  const parsed=kreaInputSchema.safeParse({...draft,seed});
  const issues=status?kreaIssues({...draft,seed},status):['먼저 ComfyUI 연결과 Krea 모델을 확인하세요.'];
  const pending=jobs.some(isPending);const latest=jobs.find(j=>isKreaInput(j.input));
  const warnings=prepareKreaPrompt(draft.sourcePrompt,draft.enhancer).warnings;
  const setMode=(enhancer:KreaInput['enhancer'])=>setDraft(value=>({...value,enhancer,prompt:prepareKreaPrompt(value.sourcePrompt,enhancer).text}));
  function setLora(name:string) {
    const style=kreaStyles.find(s=>s.name===basename(name));
    setDraft(value=>({...value,lora:name?{name,trigger:style?.trigger??'',strength:1}:null}));
  }
  async function submit(event:FormEvent){
    event.preventDefault();setSending(true);setError('');
    try {await api<Job>('jobs',{...draft,seed:draft.seed.trim()?Number(draft.seed):crypto.getRandomValues(new Uint32Array(1))[0]},'POST');await onChanged();}
    catch(err){setError(err instanceof Error?err.message:'생성 실패');}finally{setSending(false);}
  }
  const picker=(id:string,label:string,value:string,list:string[],change:(v:string)=>void)=><div><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e=>change(e.target.value)}><option value="">모델을 선택하세요</option>{list.map(n=><option key={n}>{n}</option>)}{value&&!list.includes(value)&&<option value={value}>{value} · 현재 없음</option>}</select></div>;
  return <><div className="page-heading"><div><p className="eyebrow">KREA 2 · LOCAL CREATION</p><h1>Krea 2 스튜디오</h1><p className="subtitle">자연어로 장면을 쓰고, RAW와 Turbo로 스타일을 탐색하세요.</p></div><span className="milestone-tag">M4 · 선택형 모델</span></div>
    <div className="image-layout"><form className="panel settings-panel image-form" onSubmit={e=>void submit(e)}>
      <h2><Sparkles size={20}/> 새로운 장면</h2>
      <label htmlFor="krea-profile">Krea 프로필</label><select id="krea-profile" value={draft.profile} onChange={e=>{const profile=e.target.value as KreaInput['profile'];setDraft(value=>({...value,profile,...kreaPresets[profile],width:1024,height:1024,checkpoint:recommended(status?.diffusionModels??[],`krea2_${profile==='krea-raw'?'raw':'turbo'}_fp8_scaled.safetensors`)}));}}><option value="krea-turbo">Turbo · 빠른 8스텝 생성</option><option value="krea-raw">RAW · 52스텝 기본 모델</option></select>
      <p className="field-help">{draft.steps} 스텝 · Comfy CFG {draft.cfg} · euler / simple · 배치 1{draft.profile==='krea-raw'?' · RAW 전용 CFG·해상도 어댑터':''}</p>
      {picker('krea-unet','Krea 확산 모델',draft.checkpoint,status?.diffusionModels??[],checkpoint=>setDraft({...draft,checkpoint}))}
      {picker('krea-encoder','Krea 텍스트 인코더',draft.textEncoder,status?.textEncoders??[],textEncoder=>setDraft({...draft,textEncoder}))}
      {picker('krea-vae','Krea VAE',draft.vae,status?.vaes??[],vae=>setDraft({...draft,vae}))}
      <p className="field-help">RAW/Turbo에 맞는 Krea 2 확산 모델, Qwen3VL-4B 인코더, Qwen Image VAE가 필요합니다. 파일명만으로 호환성을 판정하지 않습니다.</p>
      <label htmlFor="krea-source">장면 설명</label><textarea id="krea-source" rows={3} maxLength={8000} placeholder="예: 고양이, 숲, 부드러운 조명" value={draft.sourcePrompt} onChange={e=>setDraft({...draft,sourcePrompt:e.target.value})}/>
      <label htmlFor="krea-enhancer">프롬프트 확장 방식</label><select id="krea-enhancer" value={draft.enhancer} onChange={e=>setMode(e.target.value as KreaInput['enhancer'])}><option value="none">확장 끄기 · 입력 그대로</option><option value="app">앱에서 정리 · 한국어 키워드 사전</option><option value="engine">ComfyUI에서 확장 · 로컬 Qwen3VL</option></select>
      <p className="field-help">방식을 바꾸면 장면 설명을 다시 적용합니다. 앱 정리는 전체 문장 번역이 아닙니다. ComfyUI 확장은 생성 시 영어로 변환·확장하며 추가 시간과 메모리를 사용합니다.</p>
      <button type="button" className="secondary-button" onClick={()=>setMode(draft.enhancer)}>장면 설명을 프롬프트에 적용 <ArrowRight size={14}/></button>
      {warnings.map(w=><p className="field-help" key={w}>{w}</p>)}
      <label htmlFor="krea-prompt">Krea 생성 프롬프트</label><textarea id="krea-prompt" required rows={5} maxLength={8000} value={draft.prompt} onChange={e=>setDraft({...draft,prompt:e.target.value})}/>
      <p className="field-help">{draft.enhancer==='engine'?'확장 전 입력입니다. 엔진이 생성 중 내용을 확장하므로 최종 문장은 달라질 수 있습니다.':'이 편집 내용을 그대로 전송합니다.'} LoRA 트리거는 아래 설정에 따라 마지막에 추가됩니다.</p>
      <label htmlFor="krea-style">스타일 프리셋</label><select id="krea-style" value={kreaStyles.some(s=>s.name===basename(draft.lora?.name??''))?basename(draft.lora!.name):''} onChange={e=>setLora(recommended(status?.loras??[],e.target.value))}><option value="">선택 안 함 / 사용자 LoRA</option>{kreaStyles.map(s=><option value={s.name} key={s.name} disabled={!recommended(status?.loras??[],s.name)}>{s.label}{recommended(status?.loras??[],s.name)?'':' · 설치 필요'}</option>)}</select>
      <label htmlFor="krea-lora">LoRA 파일</label><select id="krea-lora" value={draft.lora?.name??''} onChange={e=>setLora(e.target.value)}><option value="">LoRA 사용 안 함</option>{status?.loras.map(n=><option key={n}>{n}</option>)}{draft.lora&&!status?.loras.includes(draft.lora.name)&&<option value={draft.lora.name}>{draft.lora.name} · 현재 없음</option>}</select>
      <p className="field-help">Krea 2용 LoRA만 선택하세요. RAW에서 학습한 Krea 2 LoRA를 Turbo에도 적용할 수 있습니다. 파일 설치·삭제는 ComfyUI에서 관리합니다.</p>
      {draft.lora&&<div className="parameter-grid"><div><label htmlFor="krea-strength">LoRA 강도</label><input id="krea-strength" type="number" min={-2} max={2} step={.05} required value={draft.lora.strength} onChange={e=>setDraft({...draft,lora:{...draft.lora!,strength:Number(e.target.value)}})}/></div><div><label htmlFor="krea-trigger">LoRA 트리거</label><input id="krea-trigger" maxLength={500} value={draft.lora.trigger} onChange={e=>setDraft({...draft,lora:{...draft.lora!,trigger:e.target.value}})}/></div></div>}
      <label htmlFor="krea-size">화면 비율 / 해상도</label><select id="krea-size" value={`${draft.width}x${draft.height}`} onChange={e=>{const [width,height]=e.target.value.split('x').map(Number);setDraft({...draft,width,height});}}>
        <option value="1024x1024">1:1 · 1024 × 1024</option><option value="1024x768">4:3 · 1024 × 768</option><option value="768x1024">3:4 · 768 × 1024</option><option value="1024x576">16:9 · 1024 × 576</option><option value="576x1024">9:16 · 576 × 1024</option>
        {draft.profile==='krea-turbo'&&<><option value="1536x1024">3:2 · 1536 × 1024</option><option value="1024x1536">2:3 · 1024 × 1536</option><option value="2048x2048">1:1 · 2048 × 2048</option></>}
        {!['1024x1024','1024x768','768x1024','1024x576','576x1024','1536x1024','1024x1536','2048x2048'].includes(`${draft.width}x${draft.height}`)&&<option value={`${draft.width}x${draft.height}`}>{draft.width} × {draft.height} · 기록 설정</option>}
      </select><label htmlFor="krea-seed">Krea 시드</label><input id="krea-seed" type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1} placeholder="비우면 무작위" value={draft.seed} onChange={e=>setDraft({...draft,seed:e.target.value})}/>
      {issues.length>0&&<div className="notice"><ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
      {error&&<div className="notice error" role="alert">{error}</div>}
      <button className="primary-button generate-button" disabled={!parsed.success||!!issues.length||status?.engine.state!=='connected'||checking||sending||pending}><ImageIcon size={17}/>{sending?'요청 중…':'Krea 이미지 생성'}</button>
      {pending&&<p className="field-help">기존 작업의 실행 또는 상태 확인이 끝나면 생성할 수 있습니다.</p>}
    </form><div className="image-result">
      <section className="panel settings-panel"><div className="section-heading"><h2>실행 환경 진단</h2><button className="text-button" disabled={checking} onClick={()=>void refresh()}><RefreshCw size={15} className={checking?'spin':''}/>Krea 상태 확인</button></div>
        <div className="notice">8GB 실행 가능 여부는 실기 검증 전입니다.</div>
        <p>{status?.engine.message??'ComfyUI 모델·노드·메모리를 확인합니다.'}</p>
        <dl className="krea-memory"><dt>GPU</dt><dd>{status?.engine.devices.filter(d=>d.type!=='cpu').map(d=>`${d.name} · 전체 ${gib(d.vramTotal)} / 여유 ${gib(d.vramFree)}`).join(', ')||'확인 전'}</dd><dt>시스템 RAM</dt><dd>{gib(status?.engine.ramTotal)}</dd><dt>ComfyUI 버전</dt><dd>{status?.engine.version??'확인 전'}</dd></dl>
        {status&&kreaMemoryNotes(status.engine).map(note=><p className="field-help" key={note}>{note}</p>)}
        <details><summary>모델 준비 · 저VRAM · 이용 조건</summary>
          <p className="field-help">Krea는 선택형 기능입니다. 모델 준비 전에도 기본 이미지 스튜디오를 사용할 수 있습니다. 모델을 자동 다운로드하거나 ComfyUI 설정을 변경하지 않습니다.</p>
          <p className="field-help">공식 모델을 diffusion_models / text_encoders / vae에, 스타일 파일을 loras에 배치하세요. 노드가 없으면 ComfyUI를 업데이트하고 시작 로그를 확인하세요.</p>
          <p className="field-help">저VRAM에서는 1024px·배치 1·확장 끄기부터 수동 시험하세요. ComfyUI의 --lowvram 및 CPU 텍스트 인코더 오프로딩을 검토할 수 있으나 속도와 RAM 사용량이 증가합니다. 설정의 저VRAM 선호값은 엔진에 자동 적용되지 않습니다.</p>
          <p className="field-help">Krea 2 Community License가 적용됩니다. 관계사를 포함한 연 매출이 $1M 이상이면 상업 이용 전 별도 라이선스가 필요합니다. 원문의 이용 제한·필터/검토 의무를 확인하고, 결과를 검토한 후 저장·배포하세요.</p>
          <p className="field-help">공식 가이드: https://docs.comfy.org/tutorials/image/krea/krea-2</p><p className="field-help">모델: https://huggingface.co/Comfy-Org/Krea-2</p><p className="field-help">이용 조건: https://www.krea.ai/krea-2-licensing</p>
          <button type="button" className="secondary-button" onClick={()=>void navigator.clipboard.writeText('https://docs.comfy.org/tutorials/image/krea/krea-2\nhttps://huggingface.co/Comfy-Org/Krea-2\nhttps://www.krea.ai/krea-2-licensing').catch(()=>setError('링크 복사에 실패했습니다. 위 주소를 직접 복사하세요.'))}>안내 링크 복사</button>
        </details>
      </section>
      {latest?<JobCard key={latest.id} job={latest} onChanged={onChanged} reuse={reuse}/>:<div className="panel empty-state"><Sparkles size={40}/><h2>나만의 스타일을 찾아보세요</h2><p>Krea 생성 결과와 작업 상태가 여기에 표시됩니다.</p></div>}
    </div></div></>;
}
