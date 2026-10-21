import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { createApp } from '../server/app.js';
import { simulatedComfy } from './fixtures/comfy.js';
const input = { profile: 'sd15', checkpoint: 'test.safetensors', prompt: 'a forest', negative: 'blur', width: 512, height: 512, seed: 42, steps: 20, cfg: 7 };
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), 'rgdqwer-generation-'));
  cleanup.push(() => rm(dataDir, { recursive: true, force: true }));
  const fixture = await simulatedComfy(); cleanup.push(fixture.close);
  const app = await createApp({ dataDir }); cleanup.push(() => app.close());
  const headers = { host: '127.0.0.1', authorization: `Bearer ${(await app.inject({ url: '/api/session', headers: { host: '127.0.0.1' } })).json().token}` };
  const settings = (await app.inject({ url: '/api/settings', headers })).json();
  await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: { ...settings, comfyUrl: fixture.url } });
  const submit = () => app.inject({ method: 'POST', url: '/api/jobs', headers, payload: input });
  const job = async (id: string) => (await app.inject({ url: `/api/jobs/${id}`, headers })).json();
  return { app, fixture, headers, submit, job, dataDir };
}
it('submits a real graph, saves a decoded PNG and persists its metadata', async () => {
  const { submit, job, fixture, app, headers, dataDir } = await setup();
  const response = await submit(); expect(response.statusCode).toBe(202);
  const id = response.json().id;
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('completed');
  const result = await job(id);
  expect(result.input.seed).toBe(42);
  expect(fixture.calls.find(c => c.path === '/prompt')?.body).toMatchObject({ prompt_id: id, prompt: { '5': { inputs: { batch_size: 1 } } } });
  const artifact = result.artifacts[0];
  expect((await readFile(join(dataDir, 'outputs', artifact.fileName))).subarray(1,4).toString()).toBe('PNG');
  expect((await app.inject({ url: `/api/artifacts/${artifact.id}`, headers })).statusCode).toBe(200);
  expect((await app.inject({ url: `/api/artifacts/${artifact.id}`, headers: { host: '127.0.0.1' } })).statusCode).toBe(401);
});
it('rejects a second active job and updates only sampler progress', async () => {
  const { submit, fixture, job } = await setup(); fixture.control.autoFinish = false;
  const response = await submit(); expect(response.statusCode).toBe(202);
  expect((await submit()).statusCode).toBe(409);
  await expect.poll(() => fixture.calls.filter(c => c.path === '/prompt').length, { timeout: 5000 }).toBe(1);
  fixture.progress(5);
  await expect.poll(async () => (await job(response.json().id)).progress, { timeout: 5000 }).toBe(25);
  fixture.finish();
  await expect.poll(async () => (await job(response.json().id)).state, { timeout: 5000 }).toBe('completed');
});
it('does not submit when another ComfyUI user has a queued job', async () => {
  const { submit, fixture, job } = await setup(); fixture.control.externalBusy = true;
  const response = await submit();
  await expect.poll(async () => (await job(response.json().id)).state, { timeout: 5000 }).toBe('failed');
  expect(fixture.calls.some(c => c.path === '/prompt')).toBe(false);
});
it('never marks corrupt outputs as completed', async () => {
  const { submit, fixture, job } = await setup(); fixture.control.corruptImage = true;
  const response = await submit();
  await expect.poll(async () => (await job(response.json().id)).state, { timeout: 5000 }).toBe('failed');
  expect((await job(response.json().id)).artifacts).toEqual([]);
});
it('cancels only its own prompt using the atomic job endpoint', async () => {
  const { submit, fixture, app, headers, job } = await setup(); fixture.control.autoFinish = false;
  const id = (await submit()).json().id;
  await expect.poll(() => fixture.calls.some(c => c.path === '/prompt'), { timeout: 5000 }).toBe(true);
  const result = await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel`, headers });
  expect(result.statusCode).toBe(200);
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('cancelled');
  expect(fixture.calls.some(c => c.path === `/api/jobs/${id}/cancel`)).toBe(true);
  expect(fixture.calls.some(c => c.path === '/interrupt')).toBe(false);
});
it('keeps tracking when scoped cancellation is unsupported', async () => {
  const { submit, fixture, app, headers, job } = await setup(); fixture.control.autoFinish = false; fixture.control.cancelSupported = false;
  const id = (await submit()).json().id;
  await expect.poll(() => fixture.calls.some(c => c.path === '/prompt'), { timeout: 5000 }).toBe(true);
  expect((await app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel`, headers })).statusCode).toBe(409);
  fixture.finish();
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('completed');
  expect(fixture.calls.some(c => c.path === '/interrupt')).toBe(false);
});
it('keeps ownership after a history error and resumes without resubmitting', async () => {
  const { submit, fixture, app, headers, job } = await setup();
  fixture.control.autoFinish = false; fixture.control.rejectHistory = true;
  const id = (await submit()).json().id;
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('unknown');
  expect((await submit()).statusCode).toBe(409);
  fixture.control.rejectHistory = false;
  expect((await app.inject({ method: 'POST', url: `/api/jobs/${id}/resume`, headers })).statusCode).toBe(200);
  fixture.finish();
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('completed');
  expect(fixture.calls.filter(c => c.path === '/prompt')).toHaveLength(1);
});
it('recovers a submitted job after shutdown before the submission response', async () => {
  const { submit, fixture, app, dataDir } = await setup();
  fixture.control.autoFinish = false; fixture.control.holdResponse = true;
  const id = (await submit()).json().id;
  await expect.poll(() => fixture.calls.some(c => c.path === '/prompt'), { timeout: 5000 }).toBe(true);
  await app.close();
  const restarted = await createApp({ dataDir }); cleanup.push(() => restarted.close());
  const headers = { host: '127.0.0.1', authorization: `Bearer ${(await restarted.inject({ url: '/api/session', headers: { host: '127.0.0.1' } })).json().token}` };
  fixture.finish();
  await expect.poll(async () => (await restarted.inject({ url: `/api/jobs/${id}`, headers })).json().state, { timeout: 5000 }).toBe('completed');
  expect(fixture.calls.filter(c => c.path === '/prompt')).toHaveLength(1);
  const completed = (await restarted.inject({ url: `/api/jobs/${id}`, headers })).json();
  expect(completed.input).toEqual(input); expect(completed.artifacts).toHaveLength(1);
});
it('allows a fresh attempt after a definite prompt validation rejection', async () => {
  const { submit, fixture, job } = await setup(); fixture.control.rejectPrompt = true;
  const id = (await submit()).json().id;
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('failed');
  fixture.control.rejectPrompt = false;
  const next = await submit(); expect(next.statusCode).toBe(202);
  await expect.poll(async () => (await job(next.json().id)).state, { timeout: 5000 }).toBe('completed');
});
it('rejects a foreign output path before requesting image bytes', async () => {
  const { submit, fixture, job } = await setup(); fixture.control.wrongOutput = true;
  const id = (await submit()).json().id;
  await expect.poll(async () => (await job(id)).state, { timeout: 5000 }).toBe('failed');
  expect(fixture.calls.some(c => c.path === '/view')).toBe(false);
});
it('unblocks creation after resumed tracking confirms the engine has lost the job', async () => {
  const { submit, fixture, app, headers, job } = await setup();
  fixture.control.autoFinish = false; fixture.control.rejectHistory = true;
  const id = (await submit()).json().id;
  await expect.poll(async () => (await job(id)).state, { timeout: 3000 }).toBe('unknown');
  fixture.control.rejectHistory = false; fixture.forget();
  await app.inject({ method: 'POST', url: `/api/jobs/${id}/resume`, headers });
  await expect.poll(async () => (await job(id)).state, { timeout: 18000, interval: 300 }).toBe('failed');
  expect(fixture.calls.filter(c => c.path === '/prompt')).toHaveLength(1);
  expect((await submit()).statusCode).toBe(202);
}, 22000);
it.each([false, true])('ignores stale cancel responses after tracking stops (resumed=%s)', async (resumed) => {
  const { submit, fixture, app, headers, job } = await setup();
  fixture.control.autoFinish = false; fixture.control.holdCancelResponse = true;
  const id = (await submit()).json().id;
  await expect.poll(() => fixture.calls.some(c => c.path === '/prompt'), { timeout: 3000 }).toBe(true);
  const cancellation = app.inject({ method: 'POST', url: `/api/jobs/${id}/cancel`, headers }).then(value => value);
  try {
    await expect.poll(() => fixture.calls.some(c => c.path.endsWith('/cancel')), { timeout: 3000 }).toBe(true);
    fixture.control.rejectHistory = true;
    await expect.poll(async () => (await job(id)).state, { timeout: 3000 }).toBe('unknown');
    if (resumed) {
      fixture.control.rejectHistory = false;
      await app.inject({ method: 'POST', url: `/api/jobs/${id}/resume`, headers });
      await expect.poll(async () => (await job(id)).state, { timeout: 3000 }).toBe('cancelled');
    }
    fixture.releaseCancel();
    expect((await cancellation).statusCode).toBe(200);
    expect((await job(id)).state).toBe(resumed ? 'cancelled' : 'unknown');
  } finally { fixture.releaseCancel(); await cancellation; }
});
it.each(['duplicate IHDR', 'invalid ancillary CRC'])('rejects malformed PNG: %s', async (malformation) => {
  const { submit, fixture, job } = await setup();
  const normal = PNG.sync.write(new PNG({ width: 512, height: 512 }));
  if (malformation === 'duplicate IHDR') {
    const small = PNG.sync.write(new PNG({ width: 256, height: 256 }));
    fixture.control.outputBytes = Buffer.concat([normal.subarray(0,33), small.subarray(8)]);
  } else {
    const chunk = Buffer.alloc(16); chunk.writeUInt32BE(4,0); chunk.write('tEXt',4); chunk.write('x\0hi',8);
    fixture.control.outputBytes = Buffer.concat([normal.subarray(0,33), chunk, normal.subarray(33)]);
  }
  const id = (await submit()).json().id;
  await expect.poll(async () => (await job(id)).state, { timeout: 3000 }).toBe('failed');
  expect((await job(id)).artifacts).toEqual([]);
});
