import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { analysisModelSchema, analysisResultSchema, analysisStatusSchema } from '../src/analysis.js';
const input = z.object({ image: z.string().min(4).max(6990508).refine(value => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)), model: analysisModelSchema }).strict();
const messages: Record<number,string> = {
  401: 'Worker 인증 실패: 화면의 토큰 파일 경로로 Worker를 실행하세요.',
  403: 'Worker 연결 설정을 확인하세요.', 409: 'Worker가 이미 분석 중입니다. 종료 후 다시 시도하세요.',
  413: '이미지는 5 MiB 이하여야 합니다.', 422: 'PNG/JPEG/WebP 단일 이미지(16 MP, 한 변 8192 이하)를 선택하세요.',
  503: '로컬 분석 모델과 선택형 패키지를 준비하고 Worker를 다시 실행하세요.',
};
class AnalysisError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function registerAnalysisRoutes(app: FastifyInstance, dataDir: string, workerUrl: () => string) {
  const tokenFile = join(dataDir,'worker.token');
  try { await writeFile(tokenFile,randomBytes(32).toString('hex'),{ flag:'wx',mode:0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  const secret = (await readFile(tokenFile,'utf8')).trim();
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Worker 토큰 파일이 손상되었습니다. 파일을 백업 후 다시 시작하세요.');
  let busy = false;
  const controllers = new Set<AbortController>();
  app.addHook('preClose', async () => { for (const controller of controllers) controller.abort(); });
  async function call(path: string, body?: unknown) {
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(()=>controller.abort(),body ? 300000 : 5000);
    try {
      const response = await fetch(new URL(path,workerUrl()), { method: body ? 'POST' : 'GET',
        headers: { Authorization:`Bearer ${secret}`, ...(body ? {'Content-Type':'application/json'} : {}) },
        body: body ? JSON.stringify(body) : undefined, redirect:'error',signal:controller.signal });
      if (!response.ok) { await response.body?.cancel(); throw new AnalysisError(response.status in messages ? response.status : 502,messages[response.status] ?? '분석에 실패했습니다. 모델 호환성과 메모리를 확인하세요.'); }
      if (!response.body) throw new Error('empty');
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 131072) { await reader.cancel(); throw new Error('oversize'); } chunks.push(part.value); }
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch (error) {
      if (error instanceof AnalysisError) throw error;
      throw new AnalysisError(502, controller.signal.aborted ? '분석 응답 시간이 초과되었습니다. Worker는 계속 처리 중일 수 있습니다. 상태 확인 후 재시도하세요.' : 'Worker에 연결하지 못했거나 응답이 올바르지 않습니다. 실행 상태와 주소를 확인하세요.');
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  app.get('/api/analysis/status',async (_request,reply)=> {
    try { const parsed = analysisStatusSchema.safeParse(await call('/analysis/status')); if (!parsed.success) throw new AnalysisError(502,'Worker 버전과 분석 응답 형식을 확인하세요.'); return {...parsed.data,tokenFile}; }
    catch (error) { const failure = error as AnalysisError; return reply.code(failure.status ?? 502).send({error:failure.message,tokenFile}); }
  });
  app.post('/api/analysis',{bodyLimit:7*1024*1024},async (request,reply)=> {
    const parsed = input.safeParse(request.body);
    if (!parsed.success || Buffer.byteLength(parsed.data.image,'base64') > 5*1024*1024) return reply.code(400).send({error:'이미지 형식·용량과 분석 모델을 확인하세요.'});
    if (busy) return reply.code(409).send({error:'분석 중입니다. 완료될 때까지 기다려 주세요.'});
    busy = true;
    try { const result = analysisResultSchema.safeParse(await call('/analysis',parsed.data)); if (!result.success) throw new AnalysisError(502,'Worker의 분석 결과 형식을 확인하세요.'); return result.data; }
    catch (error) { const failure = error as AnalysisError; return reply.code(failure.status ?? 502).send({error:failure.message}); }
    finally { busy = false; }
  });
}
