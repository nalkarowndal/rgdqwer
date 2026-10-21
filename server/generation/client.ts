import { z } from 'zod';
import { isLocalEndpoint } from '../settings.js';
import { requiredNodes, type Workflow } from './workflow.js';

export class EngineHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function boundedBytes(response: Response, maximum: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('서버 응답이 비어 있습니다.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > maximum) throw new Error('서버 응답이 허용 크기를 초과했습니다.');
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}
export class ComfyClient {
  constructor(private base: string, private signal: AbortSignal) {
    if (!isLocalEndpoint(base)) throw new Error('로컬 ComfyUI 주소만 허용됩니다.');
  }
  async request(path: string, body?: unknown) {
    const response = await fetch(new URL(path, this.base), {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      signal: AbortSignal.any([this.signal, AbortSignal.timeout(10000)]),
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new EngineHttpError(response.status, `ComfyUI 요청 실패 (HTTP ${response.status}). 모델·노드·서버 로그를 확인하세요.`); }
    return response;
  }
  async json(path: string, body?: unknown): Promise<unknown> {
    return JSON.parse((await boundedBytes(await this.request(path, body), 16 * 1024 ** 2)).toString());
  }
  async preflight(checkpoint: string) {
    const nodes = z.record(z.unknown()).parse(await this.json('/object_info'));
    for (const name of requiredNodes) if (!nodes[name]) throw new Error(`필수 ComfyUI 노드가 없습니다: ${name}`);
    const loader = z.object({ input: z.object({ required: z.object({ ckpt_name: z.tuple([z.array(z.string())]).rest(z.unknown()) }) }) }).parse(nodes.CheckpointLoaderSimple);
    if (!loader.input.required.ckpt_name[0].includes(checkpoint)) throw new Error('선택한 체크포인트가 없습니다. 모델 목록을 다시 확인하세요.');
    const sampler = z.object({ input: z.object({ required: z.object({ sampler_name: z.tuple([z.array(z.string())]).rest(z.unknown()), scheduler: z.tuple([z.array(z.string())]).rest(z.unknown()) }) }) }).parse(nodes.KSampler);
    if (!sampler.input.required.sampler_name[0].includes('euler') || !sampler.input.required.scheduler[0].includes('normal')) throw new Error('euler/normal 샘플러 설정을 지원하지 않는 ComfyUI입니다.');
    const queue = await this.queue();
    if (queue.length) throw new Error('ComfyUI에 다른 작업이 있습니다. 작업이 끝난 뒤 다시 시도하세요.');
  }
  async queue(): Promise<string[]> {
    const entry = z.tuple([z.number(), z.string()]).rest(z.unknown());
    const value = z.object({ queue_running: z.array(entry), queue_pending: z.array(entry) }).parse(await this.json('/queue'));
    return [...value.queue_running, ...value.queue_pending].map(row => row[1]);
  }
  async submit(prompt: Workflow, id: string) {
    return z.object({ prompt_id: z.string().uuid() }).parse(await this.json('/prompt', { prompt, prompt_id: id, client_id: id })).prompt_id;
  }
  async cancel(id: string) {
    return z.object({ cancelled: z.boolean() }).parse(await this.json(`/api/jobs/${encodeURIComponent(id)}/cancel`, {})).cancelled;
  }
  async watch(clientId: string, progress: (id: string, value: number) => void): Promise<() => void> {
    const url = new URL('/ws', this.base); url.protocol = 'ws:'; url.searchParams.set('clientId', clientId);
    const socket = new WebSocket(url);
    socket.addEventListener('error', () => {});
    socket.addEventListener('message', event => {
      if (typeof event.data !== 'string' || event.data.length > 65536) return;
      try {
        const message = JSON.parse(event.data);
        const data = message.data;
        if (message.type === 'progress' && typeof data?.prompt_id === 'string' && Number.isFinite(data.value) && Number.isFinite(data.max) && data.max > 0) {
          progress(data.prompt_id, Math.max(0, Math.min(100, Math.round(data.value / data.max * 100))));
        }
      } catch { /* Binary previews and unrelated/malformed events are not job progress. */ }
    });
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 1500);
      const done = () => { clearTimeout(timer); resolve(); };
      socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', done, { once: true });
    });
    return () => socket.close();
  }
}
