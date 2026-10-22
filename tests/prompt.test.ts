import { expect, it } from 'vitest';
import { compilePrompt, createPromptDocument, documentFromRaw, promptDocumentSchema } from '../src/prompt.js';

it('maps supported Korean keywords to tags and profile negative recommendations', () => {
  const doc = { ...createPromptDocument(), text: '고양이, 숲, 부드러운 조명' };
  expect(compilePrompt(doc, 'illustrious')).toMatchObject({ positive: 'cat, forest, soft lighting', style: 'tags', unresolved: [], negative: 'low quality, blurry' });
});
it('keeps unknown and negated clauses intact rather than partially translating them', () => {
  const result = compilePrompt({ ...createPromptDocument(), text: '고양이 없는 숲, 파란 우주선, cat' }, 'sd15');
  expect(result.positive).toBe('고양이 없는 숲, 파란 우주선, cat');
  expect(result.unresolved).toEqual(['고양이 없는 숲', '파란 우주선']);
  expect(result.warnings.length).toBeGreaterThan(0);
});
it('formats detailed fields for a natural-language profile without inventing attributes', () => {
  const doc = createPromptDocument(); doc.mode = 'detailed'; doc.fields.subject = '고양이'; doc.fields.background = '숲';
  expect(compilePrompt(doc, 'sdxl').positive).toBe('Subject: cat. Background: forest.');
});
it('preserves weighted syntax and exact whitespace in expert input', () => {
  const raw = '  (cat:1.2), \\(forest\\)\n blue eyes  ';
  expect(compilePrompt(documentFromRaw(raw, ' (blur:0.8) '), 'sd15')).toMatchObject({ positive: raw, negative: ' (blur:0.8) ' });
});
it('manual overrides survive source, mode and profile changes including empty negative', () => {
  const doc = { ...createPromptDocument(), text: '숲', editedPositive: 'my exact prompt', editedNegative: '' };
  expect(compilePrompt({ ...doc, mode: 'detailed' }, 'sdxl')).toMatchObject({ positive: 'my exact prompt', negative: '' });
});
it('allows explicit output style and disabling negative recommendations', () => {
  const doc = { ...createPromptDocument(), text: '고양이', style: 'tags' as const, suggestNegative: false, negative: 'watermark' };
  expect(compilePrompt(doc, 'sdxl')).toMatchObject({ positive: 'cat', negative: 'watermark' });
});
it('does not match inherited object keys as Korean terms', () => {
  expect(compilePrompt({ ...createPromptDocument(), text: 'constructor, __proto__, toString' }, 'sd15').positive).toBe('constructor, __proto__, toString');
});
it('rejects oversized or unrecognized prompt document structures', () => {
  expect(promptDocumentSchema.safeParse({ ...createPromptDocument(), text: 'x'.repeat(4001) }).success).toBe(false);
  expect(promptDocumentSchema.safeParse({ ...createPromptDocument(), version: 2 }).success).toBe(false);
});
it('blocks expanded output exceeding the engine text limit', () => {
  const result = compilePrompt({ ...createPromptDocument(), text: '숲,'.repeat(1900) }, 'sd15');
  expect(result.positive.length).toBeGreaterThan(8000); expect(result.valid).toBe(false);
});
