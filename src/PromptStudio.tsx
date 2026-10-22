import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from './api';
import { PromptEditor } from './PromptEditor';
import { compilePrompt, profiles, restoreRecord, type PromptDocument, type PromptProfile, type PromptRecord } from './prompt';
export interface PromptDraft { document: PromptDocument; profile: PromptProfile }
export function PromptStudio({ draft, setDraft, send }: { draft: PromptDraft; setDraft: Dispatch<SetStateAction<PromptDraft>>; send: () => void }) {
  const [records, setRecords] = useState<PromptRecord[]>([]); const [name, setName] = useState('');
  const [kind, setKind] = useState<'preset' | 'history'>('preset'); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { let active = true;
    void api<PromptRecord[]>('prompt-records').then(value => { if (active) setRecords(value); }).catch(error => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  async function save(nextKind: 'preset' | 'history') {
    setBusy(true); setMessage('');
    try {
      await api('prompt-records', { ...draft, kind: nextKind, name: nextKind === 'preset' ? name.trim() : '프롬프트 기록' }, 'POST');
      setRecords(await api<PromptRecord[]>('prompt-records')); setKind(nextKind); setMessage('저장했습니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장 실패'); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { await api(`prompt-records/${id}`, undefined, 'DELETE'); setRecords(value => value.filter(record => record.id !== id)); setMessage('삭제했습니다.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '삭제 실패'); }
    finally { setBusy(false); }
  }
  const valid = compilePrompt(draft.document, draft.profile).valid;
  return <><div className="page-heading"><div><p className="eyebrow">PROMPT WORKSPACE</p><h1>프롬프트 스튜디오</h1><p className="subtitle">한국어 키워드와 나만의 표현을 조합하고 이미지 생성으로 이어갑니다.</p></div><span className="milestone-tag">M2 · 로컬 규칙</span></div>
    <div className="prompt-layout"><section className="panel settings-panel"><label htmlFor="prompt-profile">대상 모델 프로필</label>
      <select id="prompt-profile" value={draft.profile} onChange={e => setDraft(value => ({ ...value, profile: e.target.value as PromptProfile }))}>{Object.entries(profiles).map(([key,value]) => <option key={key} value={key}>{value.label}</option>)}</select>
      <PromptEditor document={draft.document} profile={draft.profile} onChange={document => setDraft(value => ({ ...value, document }))} />
      <button type="button" className="primary-button generate-button" disabled={!valid} onClick={send}>이미지 스튜디오로 보내기</button>
      <p className="field-help">최종 입력과 모델 계열을 보냅니다. 이미지 스튜디오의 기존 프롬프트를 교체합니다. 생성 버튼을 눌러야 실행됩니다.</p>
    </section><aside className="panel settings-panel prompt-library"><h2>프리셋 / 프롬프트 기록</h2>
      <label htmlFor="preset-name">프리셋 이름</label><input id="preset-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="예: 숲속 수채화" />
      <div className="form-actions"><button className="primary-button" disabled={busy || !valid || !name.trim()} onClick={() => void save('preset')}>프리셋 저장</button><button className="secondary-button" disabled={busy || !valid} onClick={() => void save('history')}>기록에 저장</button></div>
      <p className="field-help">생성 요청 시 기록을 자동 저장합니다. 프리셋 최대 100개 · 기록 최근 100개. 저장하지 않은 초안은 앱을 새로 열면 초기화됩니다.</p>
      {message && <p role="status" className="notice">{message}</p>}
      <div className="mode-switch" role="group" aria-label="기록 종류"><button aria-pressed={kind === 'preset'} onClick={() => setKind('preset')}>프리셋</button><button aria-pressed={kind === 'history'} onClick={() => setKind('history')}>프롬프트 기록</button></div>
      <div className="prompt-records">{records.filter(record => record.kind === kind).map(record => <article className="prompt-record" key={record.id}><h3>{record.name}</h3><p>{record.result.positive}</p><small>{profiles[record.profile].label} · {new Date(record.createdAt).toLocaleString('ko-KR')}</small>
        <div className="form-actions"><button className="secondary-button" disabled={busy} onClick={() => { setDraft({ profile: record.profile, document: restoreRecord(record) }); setMessage('저장된 최종 입력을 불러왔습니다. 현재 초안을 교체했습니다.'); }}>불러오기</button><button className="secondary-button" disabled={busy} onClick={() => void remove(record.id)}>삭제</button></div>
      </article>)}</div>
      {!records.some(record => record.kind === kind) && <p className="field-help">저장된 항목이 없습니다.</p>}
    </aside></div></>;
}
