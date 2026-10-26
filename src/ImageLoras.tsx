import type {ImageInput} from './contracts';
import {profiles} from './prompt';
type Lora=NonNullable<ImageInput['loras']>[number];
export function ImageLoras({profile,rows,files,onChange}:{profile:ImageInput['profile'];rows:Lora[];files:string[];onChange:(rows:Lora[])=>void}){
 function update(index:number,patch:Partial<Lora>){onChange(rows.map((row,i)=>i===index?{...row,...patch}:row));}
 return <section className="image-loras" aria-label="이미지 LoRA 설정"><div className="lora-heading"><h3>LoRA 설정</h3><span>{rows.filter(r=>r.enabled).length}/{rows.length} 활성</span></div>
  <p className="field-help">파일별 스위치로 켜고 끕니다. 꺼도 파일·강도는 유지됩니다. 현재 모델 계열용 LoRA만 선택하고 필요한 트리거는 프롬프트에 입력하세요.</p>
  {rows.map((row,i)=>{const compatible=row.profile===profile;const choices=compatible?files:[];return <fieldset className={`lora-row ${row.enabled?'enabled':''}`} key={i}><legend>LoRA {i+1} · {profiles[row.profile].label}</legend>
   <div className="lora-heading"><label className="lora-toggle"><input type="checkbox" role="switch" aria-label={`LoRA ${i+1} 활성화`} checked={row.enabled} disabled={!compatible} onChange={e=>update(i,{enabled:e.target.checked})}/><span>{row.enabled?'활성':'비활성'}</span></label><button type="button" className="secondary-button" aria-label={`LoRA ${i+1} 제거`} onClick={()=>onChange(rows.filter((_,n)=>n!==i))}>제거</button></div>
   <label htmlFor={`image-lora-${i}`}>LoRA {i+1} 파일</label><select id={`image-lora-${i}`} value={row.name} disabled={!compatible} onChange={e=>update(i,{name:e.target.value})}>{choices.map(name=><option key={name}>{name}</option>)}{!choices.includes(row.name)&&<option value={row.name}>{row.name}{compatible?' · 현재 없음':''}</option>}</select>
   <label htmlFor={`image-lora-strength-${i}`}>LoRA {i+1} 강도</label><input id={`image-lora-strength-${i}`} type="number" min={-2} max={2} step="any" required value={row.strength} disabled={!compatible} onChange={e=>update(i,{strength:Number(e.target.value)})}/>
   {!compatible&&<p className="field-help">다른 모델 계열의 설정입니다. 해당 프로필로 돌아가면 다시 켤 수 있습니다.</p>}
  </fieldset>;})}
  <button type="button" className="secondary-button" disabled={rows.length>=4||!files.length} onClick={()=>{const name=files.find(f=>!rows.some(r=>r.enabled&&r.name===f))??files[0];onChange([...rows,{name,profile,strength:1,enabled:!rows.some(r=>r.enabled&&r.name===name)}]);}}>LoRA 추가</button>
  <p className="field-help">최대 4개 · {profile==='anima'?'Anima는 모델 강도에 적용합니다.':'SD는 모델·텍스트 인코더에 같은 강도를 적용합니다.'} 파일은 모델·확장 관리자에서 LoRA로 가져오거나 ComfyUI의 models/loras에 넣고 목록을 새로고침하세요.</p>
 </section>;
}
