import { z } from 'zod';
import type { EngineStatus, WorkerStatus } from '../src/contracts.js';
import { isLocalEndpoint } from './settings.js';

class InvalidEngineResponse extends Error {}
export async function readLocalJson(base: string, path: string, timeoutMs = 3000): Promise<unknown> {
  if (!isLocalEndpoint(base)) throw new InvalidEngineResponse('로컬 주소만 허용됩니다.');
  const response = await fetch(new URL(path, base), {
    redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new InvalidEngineResponse(`HTTP ${response.status}`);
  try { return await response.json(); }
  catch { throw new InvalidEngineResponse('JSON 응답이 아닙니다.'); }
}
const bytes = z.number().nonnegative().finite().optional();
const statsSchema = z.object({
  system: z.object({
    os: z.string().min(1), python_version: z.string().min(1),
    ram_total: bytes, comfyui_version: z.string().optional(),
  }).passthrough(),
  devices: z.array(z.object({
    name: z.string(), type: z.string(), vram_total: bytes, vram_free: bytes,
  })),
});
const nodesSchema = z.object({
  CheckpointLoaderSimple: z.object({
    input: z.object({ required: z.object({ ckpt_name: z.tuple([z.array(z.string())]).rest(z.unknown()) }) }),
  }).optional(),
});
export async function probeComfy(base: string, timeoutMs = 3000): Promise<EngineStatus> {
  const empty = { checkedAt: new Date().toISOString(), devices: [], ramTotal: null, checkpoints: [], version: null };
  try {
    const raw = await readLocalJson(base, '/system_stats', timeoutMs);
    const parsed = statsSchema.safeParse(raw);
    if (!parsed.success) throw new InvalidEngineResponse('ComfyUI /system_stats 형식을 확인하세요.');
    const { system, devices } = parsed.data;
    let checkpoints: string[] = [];
    let message = 'ComfyUI에 연결되었습니다.';
    try {
      const nodes = nodesSchema.parse(await readLocalJson(base, '/object_info/CheckpointLoaderSimple', timeoutMs));
      checkpoints = nodes.CheckpointLoaderSimple?.input.required.ckpt_name[0] ?? [];
      if (!checkpoints.length) message = '연결됨 · SD 체크포인트가 없습니다. ComfyUI의 models/checkpoints 폴더를 확인하세요.';
    } catch {
      message = '연결됨 · 체크포인트 목록 조회에 실패했습니다. ComfyUI 버전과 노드를 확인하세요.';
    }
    return {
      ...empty, state: 'connected', message, checkpoints,
      devices: devices.map(d => ({ name: d.name, type: d.type, vramTotal: d.vram_total ?? null, vramFree: d.vram_free ?? null })),
      ramTotal: system.ram_total ?? null, version: system.comfyui_version ?? null,
    };
  } catch (error) {
    const invalid = error instanceof InvalidEngineResponse ||
      (error instanceof Error && error.cause instanceof Error && error.cause.message.includes('redirect'));
    return { ...empty, state: invalid ? 'error' : 'disconnected',
      message: invalid ? 'ComfyUI 응답을 확인할 수 없습니다. 서버 주소와 포트를 확인하세요.'
        : 'ComfyUI에 연결하지 못했습니다. ComfyUI를 실행하고 주소와 포트를 확인한 뒤 다시 검사하세요.' };
  }
}
const workerSchema = z.object({
  status: z.literal('ok'),
  engine: z.literal('rgdqwer-worker'),
  capabilities: z.array(z.string()),
  hardware: z.object({
    gpu_status: z.string(), cuda_inference_verified: z.boolean(),
    gpus: z.array(z.object({ name: z.string(), memory_total_mib: z.number(), memory_free_mib: z.number(), driver: z.string() })),
  }),
});
export async function probeWorker(base: string): Promise<WorkerStatus> {
  try {
    const data = workerSchema.parse(await readLocalJson(base, '/health', 4500));
    return { state: 'connected', message: 'Worker 연결됨 · 분석 모델 준비 상태는 Image to Prompt에서 확인하세요.', capabilities: data.capabilities, hardware: data.hardware };
  } catch {
    return { state: 'disconnected', message: 'Python Worker를 실행하세요. 이미지 엔진 연결과는 독립적입니다.', capabilities: [] };
  }
}
