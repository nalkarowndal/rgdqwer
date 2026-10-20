import initSqlJs from 'sql.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Settings, Job } from '../src/contracts.js';
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
    PRAGMA user_version = 1;
  `);
  const persist = () => {
    writeFileSync(`${file}.tmp`, db.export(), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
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
      const snapshot = db.export();
      try {
        db.run('UPDATE settings SET value=? WHERE id=1', [JSON.stringify(settings)]);
        persist();
      } catch (error) {
        db.close();
        db = new SQL.Database(snapshot);
        db.run('PRAGMA foreign_keys = ON');
        throw error;
      }
      return settings;
    },
    listJobs(): Job[] {
      const rows = db.exec('SELECT id,kind,state,created_at FROM jobs ORDER BY created_at DESC LIMIT 100');
      return (rows[0]?.values ?? []).map(row => ({
        id: String(row[0]), kind: String(row[1]), state: String(row[2]), createdAt: String(row[3]),
      }));
    },
    close() { db.close(); },
  };
}
