import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ImageInput, Job } from '../../src/contracts.js';
import type { openStore } from '../store.js';
import { buildWorkflow } from './workflow.js';
import { ComfyClient, EngineHttpError } from './client.js';
import { saveOutput } from './output.js';

export class GenerationError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
const terminal = new Set<Job['state']>(['completed', 'failed', 'cancelled']);
const historySchema = z.object({ status: z.object({ completed: z.boolean(), status_str: z.string(), messages: z.array(z.tuple([z.string(), z.unknown()])).optional() }), outputs: z.record(z.unknown()) });
type Store = Awaited<ReturnType<typeof openStore>>;
export class GenerationManager {
  private active?: Job;
  private task?: Promise<void>;
  private stopped = new AbortController();
  private readyToCancel = false;
  private cancelConfirmed = false;
  constructor(private store: Store, private dataDir: string) {}
  private update(job: Job, patch: Partial<Job>, message?: string) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    if (message) job.log = [...job.log, `${job.updatedAt} ${message}`].slice(-50);
    this.store.putJob(job);
  }
  create(input: ImageInput): Job {
    if (this.active || this.stopped.signal.aborted || this.store.listJobs().some(job => !terminal.has(job.state))) throw new GenerationError(409, '기존 작업의 실행 또는 상태 확인이 끝난 뒤 생성하세요. GPU 작업은 한 번에 하나만 실행합니다.');
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), kind: 'image', state: 'preparing', input, engineUrl: this.store.getSettings().comfyUrl,
      workflowVersion: 'sd-base-v1', createdAt: now, updatedAt: now, promptId: null, progress: null, error: null, artifacts: [], log: [], cancelRequested: false };
    this.store.putJob(job); this.launch(job, false); return job;
  }
  recover() {
    const jobs = this.store.listJobs().filter(job => !terminal.has(job.state));
    if (jobs[0]) this.resume(jobs[0].id);
  }
  resume(id: string): Job {
    const job = this.store.getJob(id);
    if (!job) throw new GenerationError(404, '작업을 찾을 수 없습니다.');
    if (this.active) throw new GenerationError(409, '다른 작업을 추적하고 있습니다.');
    if (terminal.has(job.state)) return job;
    if (!job.promptId) { this.update(job, { state: 'failed', error: '제출 전에 앱이 종료되었습니다. 설정을 재사용해 다시 생성하세요.' }); return job; }
    this.launch(job, true); return job;
  }
  private launch(job: Job, resumed: boolean) {
    this.active = job; this.readyToCancel = resumed; this.cancelConfirmed = false;
    this.task = this.run(job, resumed).catch(error => {
      console.error('작업 상태 저장 실패:', error instanceof Error ? error.message : String(error));
    }).finally(() => { this.active = undefined; this.readyToCancel = false; });
  }
  async cancel(id: string): Promise<Job> {
    const job = this.active?.id === id ? this.active : this.store.getJob(id);
    if (!job) throw new GenerationError(404, '작업을 찾을 수 없습니다.');
    if (terminal.has(job.state)) return job;
    if (this.active?.id !== id) throw new GenerationError(409, '먼저 작업 상태 추적을 재개하세요.');
    if (!this.readyToCancel) { this.update(job, { cancelRequested: true }, '제출 준비 후 취소 요청을 처리합니다.'); return job; }
    const client = new ComfyClient(job.engineUrl, this.stopped.signal);
    try {
      const confirmed = await client.cancel(job.promptId!);
      // A request can outlive its tracking loop, or even a later resume of the same ID.
      if (this.active !== job) return this.store.getJob(id) ?? job;
      if (!terminal.has(job.state)) {
        this.cancelConfirmed = confirmed;
        this.update(job, { cancelRequested: true, state: confirmed ? 'cancelling' : job.state }, '작업별 취소 요청을 전송했습니다. 종료 상태를 확인합니다.');
      }
    } catch (error) {
      if (error instanceof EngineHttpError && [404,405].includes(error.status)) throw new GenerationError(409, '이 ComfyUI는 작업별 안전 취소를 지원하지 않습니다. ComfyUI에서 직접 취소하거나 서버를 업데이트하세요.');
      throw new GenerationError(502, '취소 결과를 확인하지 못했습니다. 작업 상태를 확인한 뒤 다시 시도하세요.');
    }
    return job;
  }
  private async run(job: Job, resumed: boolean) {
    const client = new ComfyClient(job.engineUrl, this.stopped.signal);
    let closeSocket = () => {}; let ambiguous = resumed; let outputStarted = false;
    try {
      if (!resumed) await client.preflight(job.input.checkpoint);
      if (job.cancelRequested && !job.promptId) { this.update(job, { state: 'cancelled' }, '제출 전에 취소했습니다.'); return; }
      closeSocket = await client.watch(job.id, (id, value) => {
        if (id !== job.promptId || this.stopped.signal.aborted || !['queued','running'].includes(job.state)) return;
        try { this.update(job, { state: 'running', progress: Math.max(job.progress ?? 0, value) }); } catch { /* The next durable state change reports storage failure. */ }
      });
      if (!resumed) {
        this.stopped.signal.throwIfAborted();
        if (job.cancelRequested) { this.update(job, { state: 'cancelled' }, '제출 전에 취소했습니다.'); return; }
        this.update(job, { state: 'queued', promptId: job.id }, 'ComfyUI에 생성 요청을 제출합니다.'); ambiguous = true;
        let promptId: string;
        try { promptId = await client.submit(buildWorkflow(job.input, job.id), job.id); }
        catch (error) {
          if (error instanceof EngineHttpError && error.status >= 400 && error.status < 500) ambiguous = false;
          throw error;
        }
        this.update(job, { promptId });
      } else this.update(job, { state: 'queued', error: null }, '기존 작업 추적을 재개했습니다. 다시 제출하지 않습니다.');
      this.readyToCancel = true;
      if (job.cancelRequested) {
        try { await this.cancel(job.id); } catch (error) { this.update(job, { cancelRequested: false, error: error instanceof Error ? error.message : '취소 실패' }); }
      }
      const start = Date.now(); let missingSince: number | undefined;
      while (Date.now() - start < 30 * 60 * 1000) {
        this.stopped.signal.throwIfAborted();
        const histories = z.record(z.unknown()).parse(await client.json(`/history/${encodeURIComponent(job.promptId!)}`));
        if (histories[job.promptId!]) {
          const history = historySchema.parse(histories[job.promptId!]);
          if (history.status.status_str === 'error') {
            const cancelled = history.status.messages?.some(([name]) => name === 'execution_interrupted');
            this.update(job, { state: cancelled ? 'cancelled' : 'failed', error: cancelled ? null : 'ComfyUI 실행에 실패했습니다. 모델 호환성·VRAM·서버 로그를 확인하고 해상도를 낮춰 다시 시도하세요.' }, cancelled ? '취소 확인' : '엔진 실행 실패'); return;
          }
          if (history.status.completed && history.status.status_str === 'success') {
            outputStarted = true; this.update(job, { state: 'postprocessing' }, 'PNG 결과를 검사하고 저장합니다.');
            const outputs = z.object({ images: z.array(z.unknown()).length(1) }).parse(history.outputs['9']);
            const artifact = await saveOutput(client, job, outputs.images[0], join(this.dataDir, 'outputs'));
            this.update(job, { state: 'completed', progress: 100, artifacts: [artifact], error: null }, '결과 저장 완료'); return;
          }
        }
        const queue = await client.queue();
        if (!queue.includes(job.promptId!)) {
          if (this.cancelConfirmed) { this.update(job, { state: 'cancelled', error: null }, '취소 후 큐 종료 확인'); return; }
          missingSince ??= Date.now();
          if (Date.now() - missingSince > 15000) {
            if (resumed) {
              this.update(job, { state: 'failed', error: '재확인한 엔진의 큐와 기록에 15초 이상 작업이 없습니다. 추적을 종료했습니다. 자동 재제출하지 않았습니다. ComfyUI 출력 폴더도 확인하세요.' }, '엔진 기록 소실 확인'); return;
            }
            throw new Error('큐와 기록에서 작업을 찾지 못했습니다. 상태 추적을 재개해 확인하세요.');
          }
        } else missingSince = undefined;
        await delay(750, undefined, { signal: this.stopped.signal });
      }
      throw new Error('30분 추적 시간이 초과되었습니다. ComfyUI 상태를 확인한 뒤 추적을 재개하세요.');
    } catch (error) {
      const state = this.stopped.signal.aborted ? 'interrupted' : ambiguous && !outputStarted ? 'unknown' : 'failed';
      this.update(job, { state, error: this.stopped.signal.aborted ? '앱 종료로 추적이 중단되었습니다. 다음 실행에서 기존 작업을 다시 확인합니다.' : (error instanceof Error ? error.message : '작업 처리 실패') }, state === 'unknown' ? '결과 미확인 — 자동 재제출하지 않습니다.' : '작업 종료');
    } finally { closeSocket(); }
  }
  async close() { this.stopped.abort(); await this.task; }
}
