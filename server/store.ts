import type { InstalledAsset, ModelTask, NodePack, LibraryPage, ModelRemoval } from '../src/models.js';
import { isVoiceInput } from '../src/voice.js';
import type { AudioSource, VoiceProfile } from '../src/voice.js';
import { isVideoInput, type MediaInput } from '../src/video.js';
import { isKreaInput } from '../src/krea.js';
import { randomUUID } from 'node:crypto';
import { compilePrompt, promptRecordInputSchema, type PromptRecord, type PromptRecordInput } from '../src/prompt.js';
import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Settings, Job, Artifact } from '../src/contracts.js';
import { defaults, settingsSchema } from './settings.js';

/** One owner per data directory; the Electron single-instance lock enforces this in desktop mode. */
export async function openStore(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'studio.sqlite');
  const SQL = await initSqlJs();
  let db = new SQL.Database(existsSync(file) ? readFileSync(file) : undefined);
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS model_removals (id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model_assets (id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model_tasks (id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model_config (id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS node_packs (id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS library_marks (id TEXT PRIMARY KEY,favorite INTEGER NOT NULL DEFAULT 0,title TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS voice_profiles (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audio_sources (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS media_inputs (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
      settings_json TEXT NOT NULL, created_at TEXT NOT NULL, error TEXT
    );
    CREATE TABLE IF NOT EXISTS prompt_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id),
      path TEXT NOT NULL, media_type TEXT NOT NULL, metadata_json TEXT NOT NULL
    );
  `);
  const persist = () => {
    writeFileSync(`${file}.tmp`, db.export(), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  const mutate = (operation: () => void) => {
    const snapshot = db.export();
    try { operation(); persist(); }
    catch (error) { db.close(); db = new SQL.Database(snapshot); db.run('PRAGMA foreign_keys = ON'); throw error; }
  };
  const version = Number(db.exec('PRAGMA user_version')[0].values[0][0]);
  if (version > 6) { db.close(); throw new Error('더 새로운 데이터베이스입니다. 최신 앱을 사용하세요.'); }
  if (version < 6) mutate(() => db.run('PRAGMA user_version = 6'));
  if (!db.exec('SELECT value FROM settings WHERE id=1').length) {
    db.run('INSERT INTO settings VALUES(1, ?)', [JSON.stringify(defaults)]);
    persist();
  }
  function insertPromptRecord(input: PromptRecordInput, id: string = randomUUID()): PromptRecord {
    const parsed = promptRecordInputSchema.parse(input);
    if (parsed.kind === 'preset' && Number(db.exec("SELECT count(*) FROM prompt_records WHERE kind='preset'")[0].values[0][0]) >= 100) throw new Error('PRESET_LIMIT');
    const record: PromptRecord = { ...parsed, id, createdAt: new Date().toISOString(), result: compilePrompt(parsed.document, parsed.profile) };
    db.run('INSERT INTO prompt_records VALUES(?,?,?,?)', [id, record.kind, record.createdAt, JSON.stringify(record)]);
    if (record.kind === 'history') db.run("DELETE FROM prompt_records WHERE kind='history' AND id NOT IN (SELECT id FROM prompt_records WHERE kind='history' ORDER BY created_at DESC,rowid DESC LIMIT 100)");
    return record;
  }
  return {
    library(options:{offset:number;limit:number;query:string;kind:'all'|'image'|'video'|'audio';favorite:boolean}):LibraryPage {
      const where="WHERE (?='all' OR j.kind=?) AND (?=0 OR m.favorite=1) AND (?='' OR instr(lower(j.settings_json||' '||coalesce(m.title,'')),lower(?))>0)";
      const params=[options.kind,options.kind,options.favorite?1:0,options.query,options.query];
      const total=Number(db.exec(`SELECT count(*) FROM jobs j LEFT JOIN library_marks m ON j.id=m.id ${where}`,params)[0].values[0][0]);
      const rows=db.exec(`SELECT j.settings_json,coalesce(m.favorite,0),coalesce(m.title,'') FROM jobs j LEFT JOIN library_marks m ON j.id=m.id ${where} ORDER BY j.created_at DESC,j.rowid DESC LIMIT ? OFFSET ?`,[...params,options.limit,options.offset])[0]?.values??[];
      return {items:rows.map(row=>({job:JSON.parse(String(row[0])) as Job,favorite:row[1]===1,title:String(row[2])})),total,offset:options.offset,limit:options.limit};
    },
    markLibrary(id:string,value:{favorite:boolean;title:string}){if(!db.exec('SELECT id FROM jobs WHERE id=?',[id]).length)return false;mutate(()=>db.run('INSERT INTO library_marks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET favorite=excluded.favorite,title=excluded.title',[id,value.favorite?1:0,value.title]));return true;},
    listModelRemovals():ModelRemoval[]{return (db.exec('SELECT value FROM model_removals ORDER BY rowid')[0]?.values??[]).map(row=>JSON.parse(String(row[0])));},
    putModelRemoval(value:ModelRemoval){mutate(()=>db.run('INSERT INTO model_removals VALUES(?,?)',[value.id,JSON.stringify(value)]));},
    finishModelRemoval(value:ModelRemoval){mutate(()=>{
      if(value.kind==='asset')db.run('DELETE FROM model_assets WHERE id=?',[value.asset.id]);
      else if(value.action==='remove')db.run('DELETE FROM node_packs WHERE id=?',[value.pack.id]);
      else {const next={...value.pack};delete next.activePath;db.run('UPDATE node_packs SET value=? WHERE id=?',[JSON.stringify(next),next.id]);}
      db.run('DELETE FROM model_removals WHERE id=?',[value.id]);
    });},
    listAssets():InstalledAsset[]{return (db.exec('SELECT value FROM model_assets ORDER BY rowid DESC')[0]?.values??[]).map(row=>JSON.parse(String(row[0])));},
    putAsset(asset:InstalledAsset){mutate(()=>db.run('INSERT INTO model_assets VALUES(?,?)',[asset.id,JSON.stringify(asset)]));},
    deleteAsset(id:string){mutate(()=>db.run('DELETE FROM model_assets WHERE id=?',[id]));},
    listModelTasks():ModelTask[]{return (db.exec('SELECT value FROM model_tasks ORDER BY rowid DESC LIMIT 20')[0]?.values??[]).map(row=>JSON.parse(String(row[0])));},
    getModelTask(id:string):ModelTask|undefined {const row=db.exec('SELECT value FROM model_tasks WHERE id=?',[id])[0]?.values[0];return row?JSON.parse(String(row[0])):undefined;},
    putModelTask(task:ModelTask){mutate(()=>db.run('INSERT INTO model_tasks VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',[task.id,JSON.stringify(task)]));},
    getModelRoot():string|undefined {const row=db.exec('SELECT value FROM model_config WHERE id=1')[0]?.values[0];return row?String(row[0]):undefined;},
    setModelRoot(root:string){mutate(()=>db.run('INSERT INTO model_config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',[root]));},
    listNodePacks():NodePack[]{return (db.exec('SELECT value FROM node_packs ORDER BY rowid DESC')[0]?.values??[]).map(row=>JSON.parse(String(row[0])));},
    putNodePack(pack:NodePack){mutate(()=>db.run('INSERT INTO node_packs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',[pack.id,JSON.stringify(pack)]));},
    deleteNodePack(id:string){mutate(()=>db.run('DELETE FROM node_packs WHERE id=?',[id]));},
    modelReferences(asset:InstalledAsset):number {
      const names=[asset.fileName,asset.relativePath.replaceAll('\\','/'),asset.id];
      return (db.exec('SELECT settings_json FROM jobs')[0]?.values??[]).filter(row=>{const job=JSON.parse(String(row[0]));const values=JSON.stringify(job.input);return names.some(name=>values.includes(name));}).length;
    },
    listVoiceProfiles(): VoiceProfile[] {return (db.exec('SELECT value FROM voice_profiles ORDER BY rowid DESC')[0]?.values??[]).map(row=>JSON.parse(String(row[0])) as VoiceProfile);},
    getVoiceProfile(id:string):VoiceProfile|undefined {const row=db.exec('SELECT value FROM voice_profiles WHERE id=?',[id])[0]?.values[0];return row?JSON.parse(String(row[0])):undefined;},
    putVoiceProfile(value:VoiceProfile){mutate(()=>db.run('INSERT INTO voice_profiles VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',[value.id,JSON.stringify(value)]));},
    deleteVoiceProfile(id:string){mutate(()=>db.run('DELETE FROM voice_profiles WHERE id=?',[id]));},
    getAudio(id:string):AudioSource|undefined {const row=db.exec('SELECT value FROM audio_sources WHERE id=?',[id])[0]?.values[0];return row?JSON.parse(String(row[0])):undefined;},
    putAudio(value:AudioSource){mutate(()=>db.run('INSERT INTO audio_sources VALUES(?,?)',[value.id,JSON.stringify(value)]));},
    deleteAudio(id:string){
      const profiles=(db.exec('SELECT value FROM voice_profiles')[0]?.values??[]).some(row=>JSON.parse(String(row[0])).referenceId===id);
      const jobs=(db.exec('SELECT settings_json FROM jobs')[0]?.values??[]).some(row=>{const j=JSON.parse(String(row[0]));return j.input?.sourceId===id||j.voiceProfile?.referenceId===id;});
      if(profiles||jobs)return false;mutate(()=>db.run('DELETE FROM audio_sources WHERE id=?',[id]));return true;
    },
    getMedia(id: string): MediaInput | undefined {
      const rows=db.exec('SELECT value FROM media_inputs WHERE id=?',[id]);
      return rows[0]?.values[0]?JSON.parse(String(rows[0].values[0][0])) as MediaInput:undefined;
    },
    putMedia(media: MediaInput) { mutate(()=>db.run('INSERT INTO media_inputs VALUES(?,?)',[media.id,JSON.stringify(media)])); },
    deleteMedia(id: string) {
      const referenced=(db.exec('SELECT settings_json FROM jobs')[0]?.values??[]).some(row=>JSON.parse(String(row[0])).input?.sourceId===id);
      if(referenced) return false;
      mutate(()=>db.run('DELETE FROM media_inputs WHERE id=?',[id]));return true;
    },
    listPromptRecords(): PromptRecord[] {
      return (db.exec('SELECT value FROM prompt_records ORDER BY created_at DESC,rowid DESC')[0]?.values ?? []).map(row => JSON.parse(String(row[0])) as PromptRecord);
    },
    savePromptRecord(input: PromptRecordInput): PromptRecord {
      let record: PromptRecord; mutate(() => { record = insertPromptRecord(input); }); return record!;
    },
    deletePromptRecord(id: string): boolean {
      let deleted = false; mutate(() => { db.run('DELETE FROM prompt_records WHERE id=?', [id]); deleted = db.getRowsModified() > 0; }); return deleted;
    },
    getSettings(): Settings {
      return settingsSchema.parse(JSON.parse(String(db.exec('SELECT value FROM settings WHERE id=1')[0].values[0][0])));
    },
    saveSettings(value: Settings): Settings {
      const settings = settingsSchema.parse(value);
      mutate(() => {
        db.run('UPDATE settings SET value=? WHERE id=1', [JSON.stringify(settings)]);
      });
      return settings;
    },
    listJobs(): Job[] {
      const rows = db.exec('SELECT settings_json FROM jobs ORDER BY created_at DESC LIMIT 100');
      return (rows[0]?.values ?? []).map(row => JSON.parse(String(row[0])) as Job);
    },
    getJob(id: string): Job | undefined {
      const result = db.exec('SELECT settings_json FROM jobs WHERE id=?', [id]);
      return result[0]?.values[0] ? JSON.parse(String(result[0].values[0][0])) as Job : undefined;
    },
    putJob(job: Job) {
      mutate(() => {
        const isNew = !db.exec('SELECT id FROM jobs WHERE id=?', [job.id]).length;
        if (isNew && !isVoiceInput(job.input) && !isKreaInput(job.input) && !isVideoInput(job.input) && job.input.promptDocument) insertPromptRecord({ kind: 'history', name: job.input.prompt.slice(0,80).trim() || '이미지 생성', profile: job.input.profile, document: job.input.promptDocument }, job.id);
        db.run(`INSERT INTO jobs(id,kind,state,settings_json,created_at,error) VALUES(?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET state=excluded.state,settings_json=excluded.settings_json,error=excluded.error`,
        [job.id, job.kind, job.state, JSON.stringify(job), job.createdAt, job.error]);
        for (const artifact of job.artifacts) db.run('INSERT OR IGNORE INTO artifacts VALUES(?,?,?,?,?)',
          [artifact.id, job.id, artifact.fileName, artifact.mediaType ?? 'image/png', JSON.stringify(artifact)]);
      });
    },
    getArtifact(id: string): Artifact | undefined {
      const result = db.exec('SELECT metadata_json FROM artifacts WHERE id=?', [id]);
      return result[0]?.values[0] ? JSON.parse(String(result[0].values[0][0])) as Artifact : undefined;
    },
    close() { db.close(); },
  };
}
