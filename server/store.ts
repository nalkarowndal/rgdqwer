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
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, state TEXT NOT NULL,
      settings_json TEXT NOT NULL, created_at TEXT NOT NULL, error TEXT
    );
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
  if (version > 2) { db.close(); throw new Error('더 새로운 데이터베이스입니다. 최신 앱을 사용하세요.'); }
  if (version < 2) mutate(() => db.run('PRAGMA user_version = 2'));
  if (!db.exec('SELECT value FROM settings WHERE id=1').length) {
    db.run('INSERT INTO settings VALUES(1, ?)', [JSON.stringify(defaults)]);
    persist();
  }
  return {
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
        db.run(`INSERT INTO jobs(id,kind,state,settings_json,created_at,error) VALUES(?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET state=excluded.state,settings_json=excluded.settings_json,error=excluded.error`,
        [job.id, job.kind, job.state, JSON.stringify(job), job.createdAt, job.error]);
        for (const artifact of job.artifacts) db.run('INSERT OR IGNORE INTO artifacts VALUES(?,?,?,?,?)',
          [artifact.id, job.id, artifact.fileName, 'image/png', JSON.stringify(artifact)]);
      });
    },
    getArtifact(id: string): Artifact | undefined {
      const result = db.exec('SELECT metadata_json FROM artifacts WHERE id=?', [id]);
      return result[0]?.values[0] ? JSON.parse(String(result[0].values[0][0])) as Artifact : undefined;
    },
    close() { db.close(); },
  };
}
