import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { createPromptDocument, compilePrompt } from '../src/prompt.js';
import { simulatedComfy } from './fixtures/comfy.js';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
const document = { ...createPromptDocument(), text: '고양이, 숲' };
const record = { kind: 'preset', name: '숲의 고양이', profile: 'sd15', document };
async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'rgdqwer-prompts-')); cleanup.push(() => rm(dataDir, { recursive: true, force: true }));
  const app = await createApp({ dataDir }); cleanup.push(() => app.close());
  const headers = { host: '127.0.0.1', authorization: `Bearer ${(await app.inject({ url: '/api/session', headers: { host: '127.0.0.1' } })).json().token}` };
  return { app, headers, dataDir };
}
it('saves exact preset snapshot, persists on reopen, and deletes without touching settings', async () => {
  const { app, headers, dataDir } = await setup();
  const response = await app.inject({ method: 'POST', url: '/api/prompt-records', headers, payload: record });
  expect(response.statusCode).toBe(201);
  expect(response.json().result.positive).toBe('cat, forest');
  await app.close();
  const store = await openStore(dataDir);
  try { expect(store.listPromptRecords()).toHaveLength(1); expect(store.getSettings().comfyUrl).toContain('127.0.0.1');
    expect(store.deletePromptRecord(response.json().id)).toBe(true); expect(store.listPromptRecords()).toEqual([]);
  } finally { store.close(); }
});
it('authenticates all prompt endpoints and validates document versions and blank results', async () => {
  const { app, headers } = await setup();
  for (const method of ['GET','POST','DELETE'] as const) expect((await app.inject({ method, url: method === 'DELETE' ? '/api/prompt-records/id' : '/api/prompt-records', headers: { host: '127.0.0.1' } })).statusCode).toBe(401);
  for (const patch of [{ document: { ...document, version: 2 } }, { document: createPromptDocument() }, { profile: 'krea' }]) {
    expect((await app.inject({ method: 'POST', url: '/api/prompt-records', headers, payload: { ...record, ...patch } })).statusCode).toBe(400);
  }
});
it('bounds history independently of presets and rejects preset overflow', async () => {
  const { app, headers } = await setup();
  for (let i = 0; i < 101; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/prompt-records', headers, payload: { ...record, kind: 'history', name: `record-${i}` } });
    expect(res.statusCode).toBe(201);
  }
  for (let i = 0; i < 100; i++) expect((await app.inject({ method: 'POST', url: '/api/prompt-records', headers, payload: record })).statusCode).toBe(201);
  expect((await app.inject({ method: 'POST', url: '/api/prompt-records', headers, payload: record })).statusCode).toBe(409);
  const records = (await app.inject({ url: '/api/prompt-records', headers })).json();
  expect(records.filter((r: { kind: string }) => r.kind === 'history')).toHaveLength(100);
  expect(records.some((r: { name: string }) => r.name === 'record-0')).toBe(false);
}, 10000);
it('sends compiled Korean to ComfyUI and records source once with the job', async () => {
  const { app, headers } = await setup(); const fixture = await simulatedComfy(); cleanup.push(fixture.close);
  const settings = (await app.inject({ url: '/api/settings', headers })).json();
  await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ...settings, comfyUrl: fixture.url } });
  const result = compilePrompt(document, 'sd15');
  const input = { profile: 'sd15', checkpoint: 'test.safetensors', prompt: result.positive, negative: result.negative,
    width: 512, height: 512, seed: 1, steps: 20, cfg: 7, promptDocument: document };
  expect((await app.inject({ method: 'POST', url: '/api/jobs', headers, payload: { ...input, prompt: 'stale text' } })).statusCode).toBe(400);
  const response = await app.inject({ method: 'POST', url: '/api/jobs', headers, payload: input }); expect(response.statusCode).toBe(202);
  await expect.poll(async () => (await app.inject({ url: `/api/jobs/${response.json().id}`, headers })).json().state, { timeout: 4000 }).toBe('completed');
  expect(fixture.calls.find(c => c.path === '/prompt')?.body).toMatchObject({ prompt: { '6': { inputs: { text: 'cat, forest' } } } });
  const records = (await app.inject({ url: '/api/prompt-records', headers })).json(); expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ kind: 'history', document: { text: '고양이, 숲' }, result: { positive: 'cat, forest' } });
});

it('migrates a v2 database without losing M1 settings or jobs', async () => {
  const { app, dataDir } = await setup(); await app.close();
  const { readFile, writeFile } = await import('node:fs/promises');
  const { default: initSqlJs } = await import('sql.js'); const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(join(dataDir, 'studio.sqlite')));
  const legacy = { id: 'legacy-job', kind: 'image', state: 'completed', input: { prompt: 'original M1 text' } };
  db.run('INSERT INTO jobs VALUES(?,?,?,?,?,?)', [legacy.id, 'image', 'completed', JSON.stringify(legacy), '2026-10-21', null]);
  db.run('DROP TABLE prompt_records; PRAGMA user_version=2');
  await writeFile(join(dataDir, 'studio.sqlite'), db.export()); db.close();
  const store = await openStore(dataDir);
  try { expect(store.getJob(legacy.id)).toEqual(legacy); expect(store.getSettings().comfyUrl).toContain('127.0.0.1'); expect(store.listPromptRecords()).toEqual([]); }
  finally { store.close(); }
});
it('rolls back job and prompt history together when the database write fails', async () => {
  const { app, dataDir } = await setup(); await app.close();
  const { mkdir } = await import('node:fs/promises'); const { GenerationManager } = await import('../server/generation/manager.js');
  const store = await openStore(dataDir); const manager = new GenerationManager(store, dataDir);
  await mkdir(join(dataDir, 'studio.sqlite.tmp'));
  try {
    expect(() => manager.create({ profile: 'sd15', checkpoint: 'test.safetensors', prompt: 'cat, forest', negative: 'blurry, low quality', width: 512, height: 512, seed: 1, steps: 20, cfg: 7, promptDocument: document })).toThrow();
    expect(store.listJobs()).toEqual([]); expect(store.listPromptRecords()).toEqual([]);
  } finally { await manager.close(); store.close(); }
});
