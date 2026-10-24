import { ModelManager } from './models/manager.js';
import { registerModelRoutes } from './models/routes.js';
import { voiceInputSchema } from '../src/voice.js';
import { voiceStatus } from './voice/engine.js';
import { registerVoiceRoutes } from './voice/routes.js';
import { isVideoInput,videoInputSchema } from '../src/video.js';
import { inspectVideo } from './generation/video.js';
import { mediaToolsStatus } from './video/process.js';
import { registerMediaRoutes } from './video/routes.js';
import { kreaInputSchema, isKreaInput } from '../src/krea.js';
import { inspectKrea } from './generation/krea.js';
import { ComfyClient } from './generation/client.js';
import { registerAnalysisRoutes } from './analysis.js';
import { promptRecordInputSchema } from '../src/prompt.js';
import Fastify, { type FastifyError } from 'fastify';
import staticFiles from '@fastify/static';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { openStore } from './store.js';
import { settingsSchema } from './settings.js';
import { probeComfy, probeWorker } from './comfy.js';
import { GenerationError, GenerationManager } from './generation/manager.js';
import { imageInputSchema } from './generation/workflow.js';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

export async function createApp(options: { dataDir: string; uiDir?: string; devOrigin?: string }) {
  const store = await openStore(options.dataDir);
  const app = Fastify({ logger: false, bodyLimit: 131072 });
  const token = randomBytes(32).toString('hex');
  const generation = new GenerationManager(store, options.dataDir);
  generation.recover();
  const models=new ModelManager(store,options.dataDir,generation);
  await models.ready();
  app.addHook('onClose', async () => { await generation.close(); store.close(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const host = request.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
      return reply.code(403).send({ error: '허용되지 않은 호스트입니다.' });
    }
    const origin = request.headers.origin;
    const allowed = origin === `http://${host}` || (options.devOrigin && origin === options.devOrigin);
    if (request.headers['sec-fetch-site'] === 'cross-site' || (origin && !allowed)) {
      return reply.code(403).send({ error: '다른 웹사이트의 요청은 허용되지 않습니다.' });
    }
    // Fastify decodes escaped static paths before matching. Authorize the matched
    // route, not the raw URL, so /%61pi/settings cannot bypass the token check.
    const route = request.routeOptions.url ?? '';
    if (route.startsWith('/api/') && route !== '/api/session') {
      const actual = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${token}`);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return reply.code(401).send({ error: '세션이 만료되었습니다. 앱을 새로고침하세요.' });
      }
    }
  });
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error instanceof GenerationError) return reply.code(error.statusCode).send({ error: error.message });
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? '로컬 처리에 실패했습니다. 저장 경로와 디스크 공간을 확인하세요.' : '요청 형식을 확인하세요.' });
  });
  app.get('/api/session', async () => ({ token }));
  app.get('/api/health', async () => ({ status: 'ok', app: 'rgdqwer', milestone: 'M6' }));
  app.get('/api/settings', async () => store.getSettings());
  app.put('/api/settings', async (request, reply) => {
    const result = settingsSchema.safeParse(request.body);
    if (!result.success) return reply.code(400).send({ error: result.error.issues.map(i => i.message).join(' ') });
    return store.saveSettings(result.data);
  });
  app.get('/api/engine/status', async () => probeComfy(store.getSettings().comfyUrl));
  app.get('/api/krea/status', async () => {
    const base = store.getSettings().comfyUrl;
    const client = new ComfyClient(base, AbortSignal.timeout(10000));
    const [engine, inventory] = await Promise.all([probeComfy(base), client.json('/object_info').then(inspectKrea).catch(() => ({
      diffusionModels: [], textEncoders: [], vaes: [], loras: [], issues: ['ComfyUI 노드 목록을 읽지 못했습니다. 서버 연결과 버전을 확인하세요.'], enhancerIssues: [], rawIssues: [], loraIssues: [],
    }))]);
    return { ...inventory, engine, checkedAt: new Date().toISOString() };
  });
  app.get('/api/voice/status',async()=>voiceStatus());
  app.get('/api/video/status',async()=>{
    const base=store.getSettings().comfyUrl;const client=new ComfyClient(base,AbortSignal.timeout(10000));
    const [engine,inventory,tools]=await Promise.all([probeComfy(base),client.json('/object_info').then(inspectVideo).catch(()=>({...inspectVideo({}),issues:['ComfyUI 연결과 Wan 노드 설치를 확인하세요.']})),mediaToolsStatus()]);
    return {...inventory,engine,tools};
  });
  app.get('/api/worker/status' , async () => probeWorker(store.getSettings().workerUrl));
  app.get('/api/prompt-records', async () => store.listPromptRecords());
  app.post('/api/prompt-records', async (request, reply) => {
    const parsed = promptRecordInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: '프롬프트 문서·이름·최종 결과를 확인하세요.' });
    try { return reply.code(201).send(store.savePromptRecord(parsed.data)); }
    catch (error) { if (error instanceof Error && error.message === 'PRESET_LIMIT') return reply.code(409).send({ error: '프리셋은 최대 100개입니다. 기존 항목을 삭제한 뒤 저장하세요.' }); throw error; }
  });
  app.delete<{ Params: { id: string } }>('/api/prompt-records/:id', async (request, reply) => {
    if (!store.deletePromptRecord(request.params.id)) return reply.code(404).send({ error: '프롬프트 기록을 찾을 수 없습니다.' });
    return { deleted: true };
  });
  app.get('/api/jobs', async () => store.listJobs());
  app.post('/api/jobs', async (request, reply) => {
    const krea = request.body && typeof request.body === 'object' && 'profile' in request.body && typeof request.body.profile === 'string' && isKreaInput({ profile: request.body.profile });
    const video = request.body && typeof request.body === 'object' && 'profile' in request.body && typeof request.body.profile === 'string' && isVideoInput({profile:request.body.profile});
    const voice = request.body && typeof request.body === 'object' && 'profile' in request.body && request.body.profile==='voice';
    const parsed = (voice ? voiceInputSchema : video ? videoInputSchema : krea ? kreaInputSchema : imageInputSchema).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map(i => i.message).join(' ') });
    return reply.code(202).send(generation.create(parsed.data));
  });
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const job = store.getJob(request.params.id);
    return job ?? reply.code(404).send({ error: '작업을 찾을 수 없습니다.' });
  });
  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async request => generation.cancel(request.params.id));
  app.post<{ Params: { id: string } }>('/api/jobs/:id/resume', async request => generation.resume(request.params.id));
  app.get<{ Params: { id: string } }>('/api/artifacts/:id', async (request, reply) => {
    const artifact = store.getArtifact(request.params.id);
    if (!artifact || !/^[a-f0-9-]+\.(png|mp4|wav|mp3)$/.test(artifact.fileName)) return reply.code(404).send({ error: '결과 파일을 찾을 수 없습니다.' });
    const path = join(options.dataDir, 'outputs', artifact.fileName);
    try { await access(path); } catch { return reply.code(404).send({ error: '결과 파일이 이동되거나 삭제되었습니다.' }); }
    return reply.type(artifact.mediaType ?? 'image/png').header('Content-Disposition', `inline; filename="${artifact.fileName}"`).send(createReadStream(path));
  });
  await registerModelRoutes(app,models);
  await registerMediaRoutes(app, options.dataDir, store);
  await registerVoiceRoutes(app, options.dataDir, store);
  await registerAnalysisRoutes(app, options.dataDir, () => store.getSettings().workerUrl);
  if (options.uiDir) await app.register(staticFiles, { root: options.uiDir, index: 'index.html' });
  return app;
}
