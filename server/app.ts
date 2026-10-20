import Fastify, { type FastifyError } from 'fastify';
import staticFiles from '@fastify/static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { openStore } from './store.js';
import { settingsSchema } from './settings.js';
import { probeComfy, probeWorker } from './comfy.js';

export async function createApp(options: { dataDir: string; uiDir?: string; devOrigin?: string }) {
  const store = await openStore(options.dataDir);
  const app = Fastify({ logger: false, bodyLimit: 32768 });
  const token = randomBytes(32).toString('hex');
  app.addHook('onClose', async () => store.close());
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
      return reply.code(403).send({ error: '허용되지 않은 호스트입니다.' });
    }
    const origin = request.headers.origin;
    const allowed = origin === `http://${host}` || (options.devOrigin && origin === options.devOrigin);
    if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && !allowed)) {
      return reply.code(403).send({ error: '다른 웹사이트의 요청은 허용되지 않습니다.' });
    }
    if (request.url.startsWith('/api/') && request.url.split('?')[0] !== '/api/session') {
      const actual = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${token}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return reply.code(401).send({ error: '세션이 만료되었습니다. 앱을 새로고침하세요.' });
      }
    }
  });
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? '로컬 처리에 실패했습니다. 저장 경로와 디스크 공간을 확인하세요.' : '요청 형식을 확인하세요.' });
  });
  app.get('/api/session', async () => ({ token }));
  app.get('/api/health', async () => ({ status: 'ok', app: 'rgdqwer', milestone: 'M0' }));
  app.get('/api/settings', async () => store.getSettings());
  app.put('/api/settings', async (request, reply) => {
    const result = settingsSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: result.error.issues.map(i => i.message).join(' ') });
    return store.saveSettings(result.data);
  });
  app.get('/api/engine/status', async () => probeComfy(store.getSettings().comfyUrl));
  app.get('/api/worker/status', async () => probeWorker(store.getSettings().workerUrl));
  app.get('/api/jobs', async () => store.listJobs());
  if (options.uiDir) await app.register(staticFiles, { root: options.uiDir, index: 'index.html' });
  return app;
}
