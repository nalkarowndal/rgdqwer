import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { simulatedAnalysis } from './fixtures/analysis.js';
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.reverse()) await fn(); cleanup.length = 0; });
async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(),'rgdqwer-analysis-')); cleanup.push(() => rm(dataDir,{recursive:true,force:true}));
  const app = await createApp({dataDir}); cleanup.push(() => app.close());
  const headers = { host:'127.0.0.1', authorization:`Bearer ${(await app.inject({url:'/api/session',headers:{host:'127.0.0.1'}})).json().token}` };
  const worker = await simulatedAnalysis(); cleanup.push(worker.close);
  const settings = (await app.inject({url:'/api/settings',headers})).json();
  await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...settings,workerUrl:worker.url}});
  return {app,headers,dataDir,worker};
}
const payload = {image:Buffer.from('synthetic file validated by Worker').toString('base64'),model:'both'};
it('authenticates encoded routes and forwards only the private Worker token', async () => {
  const {app,headers,dataDir,worker} = await setup();
  expect((await app.inject({method:'POST',url:'/%61pi/analysis',headers:{host:'127.0.0.1'},payload})).statusCode).toBe(401);
  const status = await app.inject({url:'/api/analysis/status',headers}); expect(status.statusCode).toBe(200);
  const secret = (await readFile(join(dataDir,'worker.token'),'utf8')).trim(); expect(secret).toMatch(/^[a-f0-9]{64}$/);
  expect(status.body).not.toContain(secret); expect(worker.calls[0].authorization).toBe(`Bearer ${secret}`);
  const result = await app.inject({method:'POST',url:'/api/analysis',headers,payload}); expect(result.statusCode).toBe(200); expect(result.json().caption).toContain('Synthetic fixture');
});
it('rejects oversize and arbitrary model paths before contacting Worker', async () => {
  const {app,headers,worker} = await setup();
  for (const bad of [{...payload,path:'/etc/passwd'},{...payload,model:'remote'},{...payload,image:'not-base64!'}]) expect((await app.inject({method:'POST',url:'/api/analysis',headers,payload:bad})).statusCode).toBe(400);
  expect((await app.inject({method:'POST',url:'/api/analysis',headers,payload:{...payload,image:'a'.repeat(7*1024*1024)}})).statusCode).toBe(413);
  expect(worker.calls).toEqual([]);
});
it('rejects redirects and malformed responses and hides worker error details', async () => {
  const {app,headers,worker} = await setup();
  for (const state of ['redirect','malformed','failure']) {
    worker.control.redirect = state === 'redirect'; worker.control.malformed = state === 'malformed'; worker.control.status = state === 'failure' ? 500 : 200;
    const response = await app.inject({method:'POST',url:'/api/analysis',headers,payload});
    expect(response.statusCode).toBeGreaterThanOrEqual(400); expect(response.body).not.toContain('secret private');
  }
});
it('rejects duplicate requests until active analysis completes and persists token on restart', async () => {
  const {app,headers,worker,dataDir} = await setup(); worker.control.hold = true;
  const pending = app.inject({method:'POST',url:'/api/analysis',headers,payload}).then(r=>r);
  await expect.poll(()=>worker.calls.length).toBe(1);
  expect((await app.inject({method:'POST',url:'/api/analysis',headers,payload})).statusCode).toBe(409);
  worker.release(); expect((await pending).statusCode).toBe(200);
  const token = await readFile(join(dataDir,'worker.token'),'utf8'); await app.close();
  const reopened = await createApp({dataDir}); cleanup.push(()=>reopened.close()); expect(await readFile(join(dataDir,'worker.token'),'utf8')).toBe(token);
});
