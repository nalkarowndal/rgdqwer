import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type RequestListener } from 'node:http';
import { createApp } from '../server/app.js';
import { openStore } from '../server/store.js';
import { probeComfy } from '../server/comfy.js';

const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.reverse()) await cleanup(); cleanups.length = 0; });
async function dataDir() {
  const dir = await mkdtemp(join(tmpdir(), 'rgdqwer-test-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function app() {
  const api = await createApp({ dataDir: await dataDir() });
  cleanups.push(() => api.close());
  const session = await api.inject({ url: '/api/session', headers: { host: '127.0.0.1' } });
  const headers = { host: '127.0.0.1', authorization: `Bearer ${session.json().token}` };
  return { api, headers };
}
async function mockServer(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  cleanups.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe('persistent settings and safe local API', () => {
  it('persists settings across reopening the SQLite file', async () => {
    const dir = await dataDir();
    const first = await openStore(dir);
    first.saveSettings({ ...first.getSettings(), comfyUrl: 'http://127.0.0.1:8288', modelPath: 'D:\\AI\\모델' });
    first.close();
    const second = await openStore(dir);
    expect(second.getSettings()).toMatchObject({ comfyUrl: 'http://127.0.0.1:8288', modelPath: 'D:\\AI\\모델' });
    expect(second.listJobs()).toEqual([]);
    second.close();
  });
  it('requires a session token', async () => {
    const { api } = await app();
    expect((await api.inject({ url: '/api/settings', headers: { host: '127.0.0.1' } })).statusCode).toBe(401);
  });
  it.each(['/%61pi/settings', '/%61pi/health', '/%61pi/jobs'])('requires auth after route decoding: %s', async url => {
    const { api } = await app();
    expect((await api.inject({ url, headers: { host: '127.0.0.1' } })).statusCode).toBe(401);
  });
  it('rejects unauthenticated writes with encoded routes', async () => {
    const { api, headers } = await app();
    const before = (await api.inject({ url: '/api/settings', headers })).json();
    const result = await api.inject({ method: 'PUT', url: '/%61pi/settings',
      headers: { host: '127.0.0.1' }, payload: { ...before, lowVram: false } });
    expect(result.statusCode).toBe(401);
    expect((await api.inject({ url: '/api/settings', headers })).json()).toEqual(before);
  });
  it('keeps memory and disk settings unchanged after a write failure', async () => {
    const dir = await dataDir();
    const store = await openStore(dir);
    const before = store.getSettings();
    await mkdir(join(dir, 'studio.sqlite.tmp'));
    expect(() => store.saveSettings({ ...before, lowVram: false })).toThrow();
    expect(store.getSettings()).toEqual(before);
    store.close();
    const reopened = await openStore(dir);
    expect(reopened.getSettings()).toEqual(before);
    reopened.close();
  });
  it('rejects cross-site requests and DNS rebinding hosts, including session bootstrap', async () => {
    const { api, headers } = await app();
    for (const extra of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { host: 'evil.example' }]) {
      expect((await api.inject({ url: '/api/session', headers: { ...headers, ...extra } })).statusCode).toBe(403);
    }
  });
  it.each(['https://example.com', 'http://192.168.1.5:8188', 'http://127.0.0.1:8188/path', 'http://user:pass@127.0.0.1:8188'])(
    'rejects an unsafe endpoint without changing saved settings: %s', async comfyUrl => {
      const { api, headers } = await app();
      const before = (await api.inject({ url: '/api/settings', headers })).json();
      const result = await api.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ...before, comfyUrl } });
      expect(result.statusCode).toBe(400);
      expect((await api.inject({ url: '/api/settings', headers })).json()).toEqual(before);
    });
  it('saves valid settings and returns an honest empty job list', async () => {
    const { api, headers } = await app();
    const settings = (await api.inject({ url: '/api/settings', headers })).json();
    const result = await api.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ...settings, comfyUrl: 'http://127.0.0.1:8288' } });
    expect(result.statusCode).toBe(200);
    expect(result.json().comfyUrl).toBe('http://127.0.0.1:8288');
    expect((await api.inject({ url: '/api/jobs', headers })).json()).toEqual([]);
  });
});
describe('real HTTP adapter against a simulated ComfyUI server', () => {
  it('reads hardware stats and checkpoint names from the official routes', async () => {
    const url = await mockServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(req.url === '/system_stats'
        ? { system: { os: 'nt', python_version: '3.12', ram_total: 17179869184, comfyui_version: 'test-fixture' }, devices: [{ name: 'fixture GPU', type: 'cuda', vram_total: 8589934592, vram_free: 4294967296 }] }
        : { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['model.safetensors'], {}] } } } }));
    });
    const status = await probeComfy(url);
    expect(status).toMatchObject({ state: 'connected', checkpoints: ['model.safetensors'], devices: [{ name: 'fixture GPU', vramTotal: 8589934592 }] });
  });
  it('does not accept a random JSON service as ComfyUI', async () => {
    const url = await mockServer((_req, res) => res.end('{"ok":true}'));
    expect((await probeComfy(url)).state).toBe('error');
  });
  it('does not accept empty placeholder system data as a working engine', async () => {
    const url = await mockServer((_req, res) => res.end('{"system":{},"devices":[]}'));
    expect((await probeComfy(url)).state).toBe('error');
  });
  it('times out and provides actionable recovery text', async () => {
    const url = await mockServer(() => {});
    const status = await probeComfy(url, 30);
    expect(status.state).toBe('disconnected');
    expect(status.message).toContain('ComfyUI');
  });
  it('does not follow redirects to another service', async () => {
    const url = await mockServer((_req, res) => { res.writeHead(302, { location: 'http://example.com' }); res.end(); });
    expect((await probeComfy(url)).state).toBe('error');
  });
  it('reports connected without inventing available models when loader is missing', async () => {
    const url = await mockServer((req, res) => res.end(JSON.stringify(req.url === '/system_stats' ? { system: { os: 'nt', python_version: '3.12' }, devices: [] } : {})));
    const result = await probeComfy(url);
    expect(result.state).toBe('connected');
    expect(result.checkpoints).toEqual([]);
  });
});
