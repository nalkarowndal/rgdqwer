import { describe, expect, it } from 'vitest';
import { imageInputSchema, buildWorkflow } from '../server/generation/workflow.js';
export const sample = { profile: 'sd15', checkpoint: 'test.safetensors', prompt: 'a forest', negative: '', width: 512, height: 512, seed: 42, steps: 20, cfg: 7 };
describe('bounded SD workflow', () => {
  it('maps prompt, seed and batch-one inputs to official nodes', () => {
    const graph = buildWorkflow(imageInputSchema.parse(sample), 'job');
    expect(graph['3'].inputs.seed).toBe(42);
    expect(graph['5'].inputs).toMatchObject({ width: 512, batch_size: 1 });
    expect(graph['6'].inputs.text).toBe('a forest');
    expect(graph['9'].inputs.filename_prefix).toBe('rgdqwer/job');
  });
  it.each([{ seed: -1 }, { width: 513 }, { width: 1024 }, { steps: 81 }, { cfg: 31 }, { prompt: ' ' }, { profile: 'anima' }])('rejects unsupported input %j', patch => {
    expect(imageInputSchema.safeParse({ ...sample, ...patch }).success).toBe(false);
  });
  it('allows explicit SDXL dimensions', () => {
    expect(imageInputSchema.safeParse({ ...sample, profile: 'sdxl', width: 1024, height: 1024 }).success).toBe(true);
  });
});
