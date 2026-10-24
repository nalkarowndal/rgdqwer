import { isVoiceInput } from '../../src/voice.js';
import { resolveVoiceProfile,runVoiceJob } from '../voice/engine.js';
import { isVideoInput, videoIssues, type VideoInventory } from '../../src/video.js';
import { buildVideoWorkflow, inspectVideo } from './video.js';
import { localVideoArtifacts,prepareVideoSource,saveVideoOutput } from './video-output.js';
import { isKreaInput } from '../../src/krea.js';
import { buildKreaWorkflow, inspectKrea, kreaIssues } from './krea.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { GenerationInput, Job } from '../../src/contracts.js';
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
  private maintenance=false;
  private localAbort=new AbortController();
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
  acquireMaintenance():()=>void {
    if(this.maintenance||this.active||this.stopped.signal.aborted||this.store.listJobs().some(job=>!terminal.has(job.state)))throw new GenerationError(409,'생성 또는 유지보수 작업이 끝난 뒤 실행하세요.');
    this.maintenance=true;let released=false;return()=>{if(!released){released=true;this.maintenance=false;}};
  }
  create(input: GenerationInput): Job {
    if (this.maintenance || this.active || this.stopped.signal.aborted || this.store.listJobs().some(job => !terminal.has(job.state))) throw new GenerationError(409, '기존 작업의 실행 또는 상태 확인이 끝난 뒤 생성하세요. GPU 작업은 한 번에 하나만 실행합니다.');
    let voiceProfile;
    if(isVoiceInput(input)){try{voiceProfile=resolveVoiceProfile(input,this.store);}catch(error){throw new GenerationError(400,error instanceof Error?error.message: '음성 프로필 확인 실패');}}
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), voiceProfile, kind: isVoiceInput(input)?'audio':isVideoInput(input) ? 'video' : 'image', state: 'preparing', input, engineUrl: this.store.getSettings().comfyUrl,
      workflowVersion: isVoiceInput(input)?'voice-v1':isVideoInput(input) ? (input.profile==='wan22'?'wan22-v1':'ffmpeg-v1') : isKreaInput(input) ? 'krea2-v1' : 'sd-base-v1', createdAt: now, updatedAt: now, promptId: null, progress: null, error: null, artifacts: [], log: [], cancelRequested: false };
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
    this.localAbort=new AbortController();
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
    if (!this.readyToCancel) { if(!job.promptId)this.localAbort.abort(); this.update(job, { cancelRequested: true }, '제출 준비 후 취소 요청을 처리합니다.'); return job; }
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
    const localSignal=AbortSignal.any([this.stopped.signal,this.localAbort.signal]);
    let inventory:VideoInventory|undefined;let sourceName:string|undefined;
    let closeSocket = () => {}; let ambiguous = resumed; let outputStarted = false;
    try {
      if(isVoiceInput(job.input)) {
        let queued:string[]=[];
        try{queued=await client.queue();}catch{localSignal.throwIfAborted();}
        if(queued.length)throw new Error('ComfyUI에 다른 작업이 있습니다. 종료 후 음성을 생성하세요.');
        localSignal.throwIfAborted();this.update(job,{state:'running'},'독립 음성 엔진을 실행합니다.');
        const artifacts=await runVoiceJob(job,this.store,this.dataDir,localSignal);
        this.update(job,{state:'completed',progress:100,artifacts,error:null},'WAV·MP3 음성 검증 및 저장 완료');return;
      }
      if(isVideoInput(job.input)&&job.input.profile==='video-tools') {
        this.update(job,{state:'running'},'FFmpeg 로컬 처리를 시작합니다.');
        const artifacts=await localVideoArtifacts(job,this.store.getMedia(job.input.sourceId!),this.dataDir,localSignal);
        this.update(job,{state:'completed',progress:100,artifacts,error:null},'검증된 미디어 저장 완료');return;
      }
      if (!resumed) {
        if(isVideoInput(job.input)) {
          inventory=inspectVideo(await client.json('/object_info'));
          const issues=videoIssues(job.input,inventory);if(issues.length)throw new Error(issues.join(' · '));
          if((await client.queue()).length)throw new Error('ComfyUI에 다른 작업이 있습니다.');
          sourceName=await prepareVideoSource(client,job,job.input.sourceId?this.store.getMedia(job.input.sourceId):undefined,this.dataDir,localSignal);
        } else if (isKreaInput(job.input)) {
          const issues = kreaIssues(job.input, inspectKrea(await client.json('/object_info')));
          if (issues.length) throw new Error(issues.join(' · '));
          if ((await client.queue()).length) throw new Error('ComfyUI에 다른 작업이 있습니다. 작업이 끝난 뒤 다시 시도하세요.');
        } else await client.preflight(job.input.checkpoint);
      }
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
        try { promptId = await client.submit(isVideoInput(job.input) ? buildVideoWorkflow(job.input,job.id,inventory!,sourceName) : isKreaInput(job.input) ? buildKreaWorkflow(job.input, job.id) : buildWorkflow(job.input, job.id), job.id); }
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
            outputStarted = true; this.update(job, { state: 'postprocessing' }, '결과 미디어를 검사하고 저장합니다.');
            const outputs = z.object({ images: z.array(z.unknown()).length(1) }).parse(history.outputs['9']);
            if (isKreaInput(job.input) && job.input.enhancer === 'engine') {
              const text = z.object({ text: z.array(z.string().min(1).max(16000)).length(1) }).safeParse(history.outputs['20']);
              if (!text.success || !text.data.text[0].trim()) throw new Error('엔진이 확장한 프롬프트를 확인하지 못했습니다. ComfyUI 기록과 TextGenerate 출력을 확인하세요.');
              this.update(job, { effectivePrompt: text.data.text[0] });
            }
            const artifact = isVideoInput(job.input) ? await saveVideoOutput(client,job,outputs.images[0],join(this.dataDir,'outputs'),this.stopped.signal) : await saveOutput(client, job, outputs.images[0], join(this.dataDir, 'outputs'));
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
      const state = this.stopped.signal.aborted ? 'interrupted' : job.cancelRequested && !job.promptId ? 'cancelled' : ambiguous && !outputStarted ? 'unknown' : 'failed';
      this.update(job, { state, error: state==='cancelled' ? null : this.stopped.signal.aborted ? '앱 종료로 추적이 중단되었습니다. 다음 실행에서 기존 작업을 다시 확인합니다.' : (error instanceof Error ? error.message : '작업 처리 실패') }, state === 'unknown' ? '결과 미확인 — 자동 재제출하지 않습니다.' : '작업 종료');
    } finally { closeSocket(); }
  }
  async close() { this.stopped.abort(); await this.task; }
}
