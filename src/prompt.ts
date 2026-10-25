import { z } from 'zod';

export const fieldLabels = {
  subject: ['캐릭터 / 주체', 'Subject'], appearance: ['외모', 'Appearance'], clothing: ['의상', 'Clothing'],
  expression: ['표정', 'Expression'], pose: ['자세 / 동작', 'Pose'], background: ['배경', 'Background'],
  style: ['화풍', 'Style'], composition: ['구도', 'Composition'], lighting: ['조명', 'Lighting'], color: ['색감', 'Colors'],
} as const;
export type PromptField = keyof typeof fieldLabels;
const fieldSchema = z.object({ subject: z.string().max(600), appearance: z.string().max(600), clothing: z.string().max(600),
  expression: z.string().max(600), pose: z.string().max(600), background: z.string().max(600), style: z.string().max(600),
  composition: z.string().max(600), lighting: z.string().max(600), color: z.string().max(600) }).strict();
export const promptDocumentSchema = z.object({ version: z.literal(1), mode: z.enum(['simple','detailed','expert']),
  style: z.enum(['auto','tags','natural']), text: z.string().max(4000), fields: fieldSchema,
  negative: z.string().max(8000), suggestNegative: z.boolean(), editedPositive: z.string().max(8000).nullable(), editedNegative: z.string().max(8000).nullable(),
}).strict();
export type PromptDocument = z.infer<typeof promptDocumentSchema>;
export const profileSchema = z.enum(['sd15','sdxl','illustrious','anima']);
export type PromptProfile = z.infer<typeof profileSchema>;
export const profiles: Record<PromptProfile, { label: string; style: 'tags' | 'natural'; negative: string }> = {
  sd15: { label: 'SD 1.5', style: 'tags', negative: 'blurry, low quality' },
  sdxl: { label: 'SDXL', style: 'natural', negative: 'blurry, low quality' },
  anima: { label: 'Anima Base v1', style: 'tags', negative: 'worst quality, low quality, blurry' },
  illustrious: { label: 'Illustrious', style: 'tags', negative: 'low quality, blurry' },
};
export const keywords = [
  ['고양이','cat'], ['강아지','dog'], ['여성','woman'], ['남성','man'], ['로봇','robot'], ['풍경','landscape'],
  ['숲','forest'], ['바다','ocean'], ['도시','city'], ['산','mountains'], ['정원','garden'], ['우주','space'],
  ['긴 머리','long hair'], ['짧은 머리','short hair'], ['파란 눈','blue eyes'], ['검은 머리','black hair'],
  ['드레스','dress'], ['정장','suit'], ['웃음','smile'], ['미소','smile'], ['앉아 있음','sitting'], ['서 있음','standing'],
  ['수채화','watercolor'], ['유화','oil painting'], ['사진','photograph'], ['애니메이션','anime'], ['연필화','pencil drawing'],
  ['클로즈업','close-up'], ['전신','full body'], ['정면','front view'], ['넓은 구도','wide shot'],
  ['부드러운 조명','soft lighting'], ['자연광','natural lighting'], ['역광','backlighting'], ['일몰','sunset'], ['아침','morning'],
  ['따뜻한 색감','warm colors'], ['차가운 색감','cool colors'], ['파스텔','pastel colors'], ['흑백','black and white'],
] as const;
const dictionary = new Map<string, string>(keywords);
export function createPromptDocument(): PromptDocument {
  return { version: 1, mode: 'simple', style: 'auto', text: '',
    fields: { subject: '', appearance: '', clothing: '', expression: '', pose: '', background: '', style: '', composition: '', lighting: '', color: '' },
    negative: '', suggestNegative: true, editedPositive: null, editedNegative: null };
}
export function documentFromRaw(positive: string, negative: string): PromptDocument {
  return { ...createPromptDocument(), mode: 'expert', suggestNegative: false, editedPositive: positive, editedNegative: negative };
}
export function compilePrompt(doc: PromptDocument, profile: PromptProfile) {
  const adapter = profiles[profile]; const style = doc.style === 'auto' ? adapter.style : doc.style;
  const unresolved: string[] = [];
  function translate(text: string) {
    return text.split(/[,\n]+/).map(part => part.trim()).filter(Boolean).map(part => {
      const mapped = dictionary.get(part.normalize('NFC'));
      if (mapped) return mapped;
      if (/[\p{Script=Hangul}]/u.test(part)) unresolved.push(part);
      return part;
    }).join(', ');
  }
  let generated: string;
  if (doc.mode === 'expert') generated = doc.text;
  else if (doc.mode === 'simple') {
    const text = translate(doc.text); generated = !text || style === 'tags' ? text : `Description: ${text}.`;
  } else {
    generated = (Object.keys(fieldLabels) as PromptField[]).map(key => {
      const value = translate(doc.fields[key]);
      return !value ? '' : style === 'tags' ? value : `${fieldLabels[key][1]}: ${value}.`;
    }).filter(Boolean).join(style === 'tags' ? ', ' : ' ');
  }
  const positive = doc.editedPositive ?? generated;
  const negative = doc.editedNegative ?? [doc.negative, doc.suggestNegative ? adapter.negative : ''].filter(Boolean).join(', ');
  const warnings = unresolved.length ? ['지원하지 않는 한국어 구절은 원문 그대로 남겼습니다. 전체 문장 번역이 아닙니다.'] : [];
  if (positive.length > 8000 || negative.length > 8000) warnings.push('최종 프롬프트는 각각 8,000자 이하여야 합니다. 입력을 줄이세요.');
  return { positive, negative, style, unresolved: [...new Set(unresolved)], warnings, engineVersion: 'keywords-v1',
    valid: !!positive.trim() && positive.length <= 8000 && negative.length <= 8000 };
}
export const promptRecordInputSchema = z.object({ kind: z.enum(['preset','history']), name: z.string().trim().min(1).max(80),
  profile: profileSchema, document: promptDocumentSchema }).strict().refine(v => compilePrompt(v.document, v.profile).valid, '비어 있거나 너무 긴 최종 프롬프트입니다.');
export type PromptRecordInput = z.infer<typeof promptRecordInputSchema>;
export type PromptRecord = PromptRecordInput & { id: string; createdAt: string; result: ReturnType<typeof compilePrompt> };
export function restoreRecord(record: PromptRecord): PromptDocument {
  return { ...record.document, editedPositive: record.result.positive, editedNegative: record.result.negative };
}
