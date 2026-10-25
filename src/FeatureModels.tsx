import {useState} from 'react';
import {Download,CheckCircle2,FolderOpen} from 'lucide-react';
import {catalogFiles,formatModelBytes,type CatalogStatus} from './model-catalog';
export function FeatureModels({catalog,disabled,download,showPaths}:{catalog?:CatalogStatus;disabled:boolean;download:(ids:string[])=>Promise<void>;showPaths:()=>void}){
 const [selected,setSelected]=useState<string[]>([]),[confirmed,setConfirmed]=useState(false);
 if(!catalog)return <section className="panel"><h2>기능별 모델 다운로드</h2><p>모델 목록을 불러오는 중입니다.</p></section>;
 const features=catalog.features.filter(f=>selected.includes(f.id)&&!f.ready);
 const missing=[...new Map(features.flatMap(f=>f.files.filter(file=>!file.installed)).map(file=>[file.id,file])).values()];
 const estimate=missing.reduce((sum,f)=>sum+(f.bytes||f.estimatedBytes),0);
 function toggle(id:string){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);setConfirmed(false);}
 return <section className="panel feature-downloads" aria-labelledby="feature-download-title">
  <div className="section-heading"><div><h2 id="feature-download-title">기능별 모델 다운로드</h2><p className="field-help">사용할 기능을 선택하면 필요한 기본 모델을 함께 받습니다.</p></div><span className="feature-ready"><CheckCircle2 size={15}/>{catalog.features.filter(f=>f.ready).length}/{catalog.features.length} 모델 파일 준비</span></div>
  <div className="feature-grid">{catalog.features.map(feature=>{
   const complete=feature.files.filter(f=>f.installed).length;const allBytes=feature.files.reduce((sum,f)=>sum+(f.bytes||f.estimatedBytes),0);
   const sources=[...new Map(feature.fileIds.map(id=>catalogFiles.find(f=>f.id===id)!).map(f=>[f.repo,f])).values()];
   return <article className={`feature-card${selected.includes(feature.id)||feature.ready?' selected':''}`} key={feature.id}>
    <label className="feature-choice"><input type="checkbox" aria-label={feature.name} checked={selected.includes(feature.id)||feature.ready} disabled={disabled||feature.ready} onChange={()=>toggle(feature.id)}/><span className="feature-copy"><strong>{feature.name}</strong><small>{feature.description} · 약 {formatModelBytes(allBytes)}</small></span><span className="feature-badge">{feature.ready?'모델 준비':complete?`${complete}/${feature.files.length} 파일`:'기본 모델'}</span></label>
    <details className="feature-details"><summary>파일·출처·연결 안내</summary><p>{feature.setup}</p>{sources.map(source=><div key={source.repo}><p>출처: {source.repo} · {source.license}</p><p className="model-path">이용 조건: {source.licenseUrl}</p></div>)}<ul>{feature.files.map(file=><li key={file.id}><strong>{file.name}</strong><span>{file.installed?'다운로드 완료':'다운로드 필요'}</span><p className="model-path">{file.path}</p>{file.issue&&<p className="notice">{file.issue}</p>}</li>)}</ul></details>
   </article>;
  })}</div>
  <div className="feature-download-footer"><p className="feature-selection">{features.length}개 기능 · {missing.length}개 파일 · 추가 다운로드 약 {formatModelBytes(estimate)}</p><p className="field-help">공통 파일과 완료한 파일은 중복으로 받지 않습니다. 정확한 크기는 공식 저장소 확인 후 진행률에 표시됩니다.</p>
   <label className="check-row"><input type="checkbox" checked={confirmed} disabled={disabled||!features.length} onChange={e=>setConfirmed(e.target.checked)}/>선택한 모델의 출처와 이용 조건을 확인했습니다.</label>
   <div className="form-actions"><button className="primary-button" disabled={disabled||!features.length||!confirmed} onClick={()=>void download(features.map(f=>f.id))}><Download size={16}/>선택 모델 다운로드</button><button className="secondary-button" onClick={showPaths}><FolderOpen size={16}/>저장 경로·엔진 연결</button></div>
   <p className="field-help">취소·실패한 경우 기능을 다시 선택해 다운로드하세요. 완료한 파일은 유지하고, 중단된 파일은 처음부터 받습니다.</p><p className="model-path">저장 폴더: {catalog.root}</p><p className="field-help">현재 저장 폴더 기준의 모델 파일 준비 상태입니다. ComfyUI 연결·경로 설정, Python 환경과 실제 GPU 실행 준비는 별도입니다. 용량은 VRAM 요구량이 아닙니다.</p>
  </div>
 </section>;
}
