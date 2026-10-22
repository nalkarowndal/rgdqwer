import { compilePrompt, promptDocumentSchema } from '../../src/prompt.js';
import { z } from 'zod';
import type { ImageInput } from '../../src/contracts.js';

export const imageInputSchema = z.object({
  promptDocument: promptDocumentSchema.optional(),
  profile: z.enum(['sd15', 'sdxl', 'illustrious']),
  checkpoint: z.string().min(1).max(1024),
  prompt: z.string().max(8000).refine(value => !!value.trim(), '프롬프트를 입력하세요.'),
  negative: z.string().max(8000),
  width: z.number().int().min(256).max(1024).multipleOf(64),
  height: z.number().int().min(256).max(1024).multipleOf(64),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  steps: z.number().int().min(1).max(80), cfg: z.number().min(1).max(30),
}).strict().refine(v => v.profile !== 'sd15' || (v.width <= 768 && v.height <= 768),
  'SD 1.5는 가로·세로 최대 768px입니다.').refine(value => {
    if (!value.promptDocument) return true;
    const result = compilePrompt(value.promptDocument, value.profile);
    return result.valid && value.prompt === result.positive && value.negative === result.negative;
  }, '프롬프트 원문과 최종 결과가 다릅니다. 현재 결과로 다시 요청하세요.');

export const requiredNodes = ['KSampler', 'CheckpointLoaderSimple', 'EmptyLatentImage', 'CLIPTextEncode', 'VAEDecode', 'SaveImage'];
export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export function buildWorkflow(input: ImageInput, id: string): Workflow {
  return {
    '3': { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0], seed: input.seed, steps: input.steps, cfg: input.cfg, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: input.checkpoint } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: input.width, height: input.height, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: input.negative, clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: `rgdqwer/${id}` } },
  };
}
