import { z } from 'zod';
import { compilePrompt, createPromptDocument } from './prompt.js';
import type { EngineStatus } from './contracts.js';

export const kreaPresets = { 'krea-turbo': { steps: 8, cfg: 1 }, 'krea-raw': { steps: 52, cfg: 4.5 } } as const;
export const kreaInputSchema = z.object({
  profile: z.enum(['krea-turbo','krea-raw']), checkpoint: z.string().min(1).max(1024),
  textEncoder: z.string().min(1).max(1024), vae: z.string().min(1).max(1024),
  sourcePrompt: z.string().max(8000), prompt: z.string().max(8000).refine(v=>!!v.trim()), negative: z.literal(''),
  enhancer: z.enum(['none','app','engine']),
  width: z.number().int().min(512).max(2048).multipleOf(64), height: z.number().int().min(512).max(2048).multipleOf(64),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), steps: z.number(), cfg: z.number(),
  lora: z.object({ name: z.string().min(1).max(1024), strength: z.number().finite().min(-2).max(2), trigger: z.string().max(500) }).strict().nullable(),
}).strict().refine(v => Math.max(v.width,v.height)>=1024 && (v.profile !== 'krea-raw' || Math.max(v.width,v.height)<=1024), 'RAW는 최대 1024px, Turbo는 최대 2048px이며 한 변은 1024px 이상이어야 합니다.')
  .refine(v=>v.steps===kreaPresets[v.profile].steps && v.cfg===kreaPresets[v.profile].cfg,'프로필 권장 스텝·CFG를 사용하세요.');
export type KreaInput = z.infer<typeof kreaInputSchema>;
export const isKreaInput = (input: {profile:string}): input is KreaInput => input.profile==='krea-turbo' || input.profile==='krea-raw';
export interface KreaInventory {
  diffusionModels: string[]; textEncoders: string[]; vaes: string[]; loras: string[];
  issues: string[]; enhancerIssues: string[]; rawIssues: string[]; loraIssues: string[];
}
export interface KreaStatus extends KreaInventory { engine: EngineStatus; checkedAt: string }
export const kreaStyles = [
  ['darkbrush','먹 번짐','monochrome ink wash style'],['dotmatrix','점묘','monochrome stippling style'],
  ['kidsdrawing','아이의 스케치','naive expressive sketch style'],['neondrip','추상 네온','textured abstract style'],
  ['rainywindow','비 오는 창','rainy window style'],['retroanime','레트로 애니','purple retro anime style'],
  ['softwatercolor','부드러운 수채화','art deco watercolor style'],['sunsetblur','노을의 흐림','ethereal motion blur style'],
  ['vintagetarot','빈티지 타로','vintage tarot style'],
].map(([id,label,trigger])=>({name:`krea2_${id}.safetensors`,label,trigger,strength:1}));
export function prepareKreaPrompt(source: string, enhancer: KreaInput['enhancer']) {
  if(enhancer!=='app') return {text:source,warnings:[] as string[]};
  const doc=createPromptDocument(); doc.text=source.slice(0,4000); doc.style='natural'; doc.suggestNegative=false;
  const result=compilePrompt(doc,'sdxl');
  if(source.length>4000) return {text:source,warnings:['앱 정리는 4,000자까지 지원합니다. 원문을 유지했습니다.']};
  return {text:result.positive,warnings:result.warnings};
}
export function kreaMemoryNotes(engine: EngineStatus): string[] {
  const notes=['실제 모델 추론·속도·안정성은 검증 전입니다. 모델 목록은 파일 발견 결과이며 호환성을 보장하지 않습니다.'];
  const gpu=engine.devices.find(d=>['cuda','mps','xpu','privateuseone'].includes(d.type));
  if(!gpu) notes.push('GPU 메모리를 확인하지 못했습니다. CPU 실행은 매우 느릴 수 있습니다.');
  else if(gpu.vramTotal==null) notes.push('GPU 전체 VRAM을 확인하지 못했습니다.');
  else if(gpu.vramTotal<=8*1024**3) notes.push('8GB 이하 VRAM: RTX 2060 SUPER를 포함해 실행·속도를 보장하지 않습니다. CPU 오프로딩과 충분한 RAM이 필요할 수 있습니다.');
  if(engine.ramTotal==null) notes.push('시스템 RAM을 확인하지 못했습니다.');
  notes.push('공식 FP8 파일은 확산 모델 약 13.1GB + 인코더 약 5.2GB + VAE입니다. 파일 크기는 실행 VRAM 요구량과 다릅니다.');
  return notes;
}

export function kreaIssues(input: KreaInput, status: KreaInventory): string[] {
  const issues=[...status.issues];
  for(const [name,list] of [[input.checkpoint,status.diffusionModels],[input.textEncoder,status.textEncoders],[input.vae,status.vaes]] as const)
    if(!list.includes(name)) issues.push(`선택한 모델 파일 없음: ${name}`);
  if(input.profile==='krea-raw') issues.push(...status.rawIssues);
  if(input.enhancer==='engine') issues.push(...status.enhancerIssues);
  if(input.lora) {issues.push(...status.loraIssues); if(!status.loras.includes(input.lora.name)) issues.push(`선택한 LoRA 파일 없음: ${input.lora.name}`);}
  return issues;
}
