import { useId, useState } from 'react';
import { compilePrompt, fieldLabels, keywords, type PromptDocument, type PromptField, type PromptProfile } from './prompt';

export function PromptEditor({ document: doc, profile, onChange }: { document: PromptDocument; profile: PromptProfile; onChange: (value: PromptDocument) => void }) {
  const id = useId(); const [query, setQuery] = useState(''); const [target, setTarget] = useState<PromptField>('subject'); const [notice, setNotice] = useState('');
  const result = compilePrompt(doc, profile);
  const edited = doc.editedPositive !== null || doc.editedNegative !== null;
  function mode(value: PromptDocument['mode']) {
    onChange(value === 'expert' ? { ...doc, mode: value, editedPositive: result.positive, editedNegative: result.negative } : { ...doc, mode: value });
  }
  function keyword(word: string) {
    const previous = doc.mode === 'detailed' ? doc.fields[target] : doc.text;
    const next = previous ? `${previous}, ${word}` : word;
    if (next.length > (doc.mode === 'detailed' ? 600 : 4000)) { setNotice('입력 길이를 줄인 뒤 키워드를 추가하세요.'); return; }
    onChange(doc.mode === 'detailed' ? { ...doc, fields: { ...doc.fields, [target]: next } } : { ...doc, text: next }); setQuery('');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(result.positive); setNotice('프롬프트를 복사했습니다.'); }
    catch { setNotice('복사 권한이 없습니다. 프롬프트 입력창에서 직접 선택해 복사하세요.'); }
  }
  return <div className="prompt-editor">
    <div className="mode-switch" role="group" aria-label="프롬프트 입력 모드">
      {(['simple','detailed','expert'] as const).map((value, index) => <button type="button" key={value} aria-pressed={doc.mode === value} onClick={() => mode(value)}>{['간편','상세','전문가'][index]}</button>)}
    </div>
    {doc.mode === 'simple' && <><label htmlFor={`${id}-idea`}>한국어 아이디어</label>
      <textarea id={`${id}-idea`} rows={3} maxLength={4000} value={doc.text} onChange={e => onChange({ ...doc, text: e.target.value })} placeholder="고양이, 숲, 부드러운 조명" />
      <button type="button" className="text-button" onClick={() => onChange({ ...doc, text: '고양이, 숲, 부드러운 조명' })}>예시 넣기</button></>}
    {doc.mode === 'detailed' && <div className="prompt-fields">{(Object.keys(fieldLabels) as PromptField[]).map(key => <div key={key}><label htmlFor={`${id}-${key}`}>{fieldLabels[key][0]}</label>
      <input id={`${id}-${key}`} maxLength={600} value={doc.fields[key]} onFocus={() => setTarget(key)} onChange={e => onChange({ ...doc, fields: { ...doc.fields, [key]: e.target.value } })} /></div>)}</div>}
    {doc.mode !== 'expert' && <>
      <label htmlFor={`${id}-keywords`}>키워드 검색 / 자동완성</label><input id={`${id}-keywords`} value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="예: 조명, 숲, watercolor" />
      <div className="keyword-list" aria-label="추천 키워드">{keywords.filter(([ko,en]) => ko.includes(query) || en.includes(query.toLowerCase())).slice(0,8).map(([ko,en]) => <button type="button" key={ko} title={en} onClick={() => keyword(ko)}>{ko}</button>)}</div>
      {doc.mode === 'detailed' && <p className="field-help">키워드 추가 위치: {fieldLabels[target][0]} · 수정할 항목을 먼저 선택하세요.</p>}
      <p className="field-help">쉼표·줄바꿈으로 구분한 지원 키워드만 변환합니다. 모르는 문장은 그대로 보존합니다.</p>
      <label htmlFor={`${id}-style`}>출력 형식</label><select id={`${id}-style`} value={doc.style} onChange={e => onChange({ ...doc, style: e.target.value as PromptDocument['style'] })}><option value="auto">모델 프로필 기본값</option><option value="tags">태그형</option><option value="natural">문장형 템플릿</option></select>
      <label className="checkbox-label"><input type="checkbox" checked={doc.suggestNegative} onChange={e => onChange({ ...doc, suggestNegative: e.target.checked })} />Negative 추천 포함</label>
    </>}
    <div className="prompt-output-heading"><strong>최종 입력 · {result.style === 'tags' ? '태그형' : '문장형'}</strong><span>{edited ? '직접 수정값 유지' : '규칙 기반 조합'}</span></div>
    <label htmlFor={`${id}-positive`}>프롬프트</label><textarea id={`${id}-positive`} rows={4} maxLength={8000} value={result.positive} onChange={e => onChange({ ...doc, editedPositive: e.target.value })} />
    <label htmlFor={`${id}-negative`}>Negative Prompt</label><textarea id={`${id}-negative`} rows={2} maxLength={8000} value={result.negative} onChange={e => onChange({ ...doc, editedNegative: e.target.value })} />
    {edited && <p className="field-help">원문·모드·프로필을 바꿔도 직접 수정한 최종 입력을 유지합니다.</p>}
    <div className="form-actions"><button type="button" className="secondary-button" onClick={() => void copy()} disabled={!result.positive}>프롬프트 복사</button>
      {edited && doc.mode !== 'expert' && <button type="button" className="secondary-button" title="직접 수정한 두 결과를 지우고 현재 원문에서 다시 조합합니다." onClick={() => onChange({ ...doc, editedPositive: null, editedNegative: null })}>수정값 지우고 추천 재적용</button>}
    </div>
    {result.warnings.map(text => <p className="notice" key={text}>{text}</p>)}
    {!!result.unresolved.length && <p className="field-help">원문 보존: {result.unresolved.join(' / ')}</p>}
    {notice && <p role="status" className="field-help">{notice}</p>}
  </div>;
}
