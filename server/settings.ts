import { z } from 'zod';

export function isLocalEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' &&
      !url.username && !url.password && (url.pathname === '/' || url.pathname === '') &&
      !url.search && !url.hash;
  } catch { return false; }
}
const endpoint = z.string().max(200).refine(isLocalEndpoint,
  '같은 PC의 http://127.0.0.1:포트 형식으로 입력하세요.');
export const settingsSchema = z.object({
  comfyUrl: endpoint,
  workerUrl: endpoint,
  comfyPath: z.string().max(4096),
  modelPath: z.string().max(4096),
  lowVram: z.boolean(),
}).strict();
export const defaults = {
  comfyUrl: 'http://127.0.0.1:8188',
  workerUrl: 'http://127.0.0.1:8189',
  comfyPath: '',
  modelPath: '',
  lowVram: true,
};
