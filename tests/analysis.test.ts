import { expect, it } from 'vitest';
import { analysisResultSchema, createAnalysisDraft, mergeAnalysis, toPromptDocument, type AnalysisResult } from '../src/analysis.js';
import { compilePrompt } from '../src/prompt.js';
const result: AnalysisResult = { caption: 'A person in a forest.', ocr: 'HELLO', tags: [
  { name: 'blue eyes', score: 0.8, category: 'general' }, { name: 'forest', score: 0.7, category: 'general' },
  { name: 'unmapped tag', score: 0.5, category: 'general' }], models: ['florence','wd14'], width: 16, height: 8 };
it('maps known tags while retaining caption and unclassified evidence without invented certainty', () => {
  const draft = mergeAnalysis(createAnalysisDraft(), createAnalysisDraft(), result);
  expect(draft.values.appearance).toBe('blue eyes'); expect(draft.values.background).toBe('forest');
  expect(draft.values.other).toBe('unmapped tag'); expect(draft.values.caption).toBe(result.caption);
  expect(draft.values.clothing).toBe('');
});
it('preserves locked fields and edits made during a pending analysis including cleared values', () => {
  const before = createAnalysisDraft(); const current = createAnalysisDraft();
  current.values.appearance = 'brown eyes'; current.locked.appearance = true;
  before.values.background = 'old'; current.values.background = '';
  const merged = mergeAnalysis(current, before, result);
  expect(merged.values.appearance).toBe('brown eyes'); expect(merged.values.background).toBe('');
  expect(merged.values.caption).toBe(result.caption);
});
it('converts profile format and only includes OCR explicitly, with final length validated by M2', () => {
  const draft = mergeAnalysis(createAnalysisDraft(), createAnalysisDraft(), result);
  expect(compilePrompt(toPromptDocument(draft, 'sdxl'), 'sdxl').positive).toContain('Appearance: blue eyes');
  expect(compilePrompt(toPromptDocument(draft, 'sd15'), 'sd15').positive).not.toContain('HELLO');
  draft.includeOcr = true;
  expect(compilePrompt(toPromptDocument(draft, 'sd15'), 'sd15').positive).toContain('HELLO');
});
it('rejects unknown model output, ratings, invalid confidence and unbounded output', () => {
  for (const patch of [{ tags: [{ name: 'rating', score: 0.9, category: 'rating' }] }, { tags: [{ name: 'bad', score: 2, category: 'general' }] }, { caption: 'x'.repeat(4001) }, { width: 9000 }]) {
    expect(analysisResultSchema.safeParse({ ...result, ...patch }).success).toBe(false);
  }
});
it('can omit the original caption after changing fields to avoid conflicting scene descriptions', () => {
  const draft = mergeAnalysis(createAnalysisDraft(), createAnalysisDraft(), result);
  draft.values.background = 'ocean'; draft.includeCaption = false;
  const prompt = compilePrompt(toPromptDocument(draft,'sd15'),'sd15').positive;
  expect(prompt).toContain('ocean'); expect(prompt).not.toContain('forest');
});
