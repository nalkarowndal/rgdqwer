import { z } from 'zod';
import { compilePrompt, createPromptDocument, fieldLabels, profiles, type PromptProfile, type PromptField } from './prompt.js';
export const analysisModelSchema = z.enum(['florence','wd14','both']);
export type AnalysisModel = z.infer<typeof analysisModelSchema>;
export const analysisResultSchema = z.object({ caption: z.string().max(4000), ocr: z.string().max(4000),
  tags: z.array(z.object({ name: z.string().min(1).max(200), score: z.number().finite().min(0).max(1), category: z.enum(['general','character']) }).strict()).max(100),
  models: z.array(z.enum(['florence','wd14'])).min(1).max(2), width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
}).strict();
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export const analysisStatusSchema = z.object({ busy: z.boolean(), device: z.literal('cpu'),
  models: z.array(z.object({ id: z.enum(['florence','wd14']), available: z.boolean(), reason: z.string().max(300) }).strict()).length(2),
}).strict();
export type AnalysisStatus = z.infer<typeof analysisStatusSchema> & { tokenFile: string };
export const analysisLabels = { caption: '전체 설명 / 캡션', ...Object.fromEntries(Object.entries(fieldLabels).map(([key,value]) => [key,value[0]])) as Record<PromptField,string>, other: '미분류 태그', ocr: '이미지의 텍스트 / OCR' };
export type AnalysisField = keyof typeof analysisLabels;
export const analysisFields = Object.keys(analysisLabels) as AnalysisField[];
export type AnalysisDraft = { values: Record<AnalysisField,string>; locked: Record<AnalysisField,boolean>; includeOcr: boolean; includeCaption: boolean };
export function createAnalysisDraft(): AnalysisDraft {
  return { values: Object.fromEntries(analysisFields.map(key => [key,''])) as AnalysisDraft['values'],
    locked: Object.fromEntries(analysisFields.map(key => [key,false])) as AnalysisDraft['locked'], includeOcr: false, includeCaption: true };
}
// Conservative exact-tag classification. Unmatched evidence stays visible in other.
const groups: Record<PromptField, string[]> = {
  subject: ['1girl','1boy','solo','cat','dog','person','multiple girls','multiple boys'],
  appearance: ['blue eyes','brown eyes','green eyes','red eyes','long hair','short hair','blonde hair','black hair','brown hair','white hair'],
  clothing: ['dress','shirt','white shirt','skirt','jacket','hat','school uniform','suit','gloves'],
  expression: ['smile','open mouth','closed eyes','crying','blush','angry'],
  pose: ['standing','sitting','walking','running','lying','looking at viewer'],
  background: ['forest','outdoors','indoors','sky','cloud','clouds','beach','ocean','mountain','city','tree','trees','grass','simple background','white background'],
  style: ['realistic','photorealistic','watercolor','sketch','lineart','anime coloring'],
  composition: ['portrait','close-up','upper body','full body','from above','from below','from behind','profile'],
  lighting: ['backlighting','sunlight','sunset','night','day','shadow'],
  color: ['monochrome','greyscale','sepia','pastel colors','limited palette'],
};
const category = new Map(Object.entries(groups).flatMap(([key,tags])=>tags.map(tag=>[tag,key as PromptField] as const)));
export function mergeAnalysis(current: AnalysisDraft, started: AnalysisDraft, result: AnalysisResult): AnalysisDraft {
  const next = createAnalysisDraft().values; next.caption = result.caption; next.ocr = result.ocr;
  for (const tag of result.tags) {
    const key = tag.category === 'character' ? 'other' : category.get(tag.name) ?? 'other';
    // Tags may contain prompt weight syntax. Escape literal parentheses when assembling.
    const name = tag.name.replace(/[()]/g, '\\$&');
    next[key] = [next[key],name].filter(Boolean).join(', ');
  }
  return { ...current, values: Object.fromEntries(analysisFields.map(key => [key,
    current.locked[key] || current.values[key] !== started.values[key] ? current.values[key] : next[key],
  ])) as AnalysisDraft['values'] };
}
export function toPromptDocument(draft: AnalysisDraft, profile: PromptProfile) {
  const doc = createPromptDocument(); doc.mode = 'detailed';
  for (const key of Object.keys(fieldLabels) as PromptField[]) doc.fields[key] = draft.values[key].slice(0,600);
  // Keep full edited values in the final prompt; do not silently truncate long tag lists.
  const natural = profiles[profile].style === 'natural';
  const sections = (Object.keys(fieldLabels) as PromptField[]).map(key => {
    const value = draft.values[key].trim(); return !value ? '' : natural ? `${fieldLabels[key][1]}: ${value}.` : value;
  });
  doc.editedPositive = [draft.includeCaption ? draft.values.caption.trim() : '', ...sections, draft.values.other.trim(), draft.includeOcr && draft.values.ocr.trim() ? `Text in image: ${draft.values.ocr.trim()}` : ''].filter(Boolean).join(natural ? ' ' : ', ');
  doc.text = draft.values.caption.slice(0,4000);
  doc.editedNegative = compilePrompt(doc,profile).negative;
  return doc;
}
