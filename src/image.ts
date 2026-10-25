import type {ImageInput} from './contracts.js';
export interface ImageInventory {
 checkpoints:string[];diffusionModels:string[];textEncoders:string[];vaes:string[];loras:string[];animaLoras:string[];
 issues:string[];animaIssues:string[];loraIssues:string[];animaLoraIssues:string[];
}
export function imageIssues(input:ImageInput,status:ImageInventory):string[]{
 const anima=input.profile==='anima';const issues=[...(anima?status.animaIssues:status.issues)];
 if(!(anima?status.diffusionModels:status.checkpoints).includes(input.checkpoint))issues.push(`선택한 ${anima?'Anima 확산 모델':'체크포인트'} 없음: ${input.checkpoint||'선택 필요'}`);
 if(anima){
  if(!status.textEncoders.includes(input.textEncoder??''))issues.push(`Anima 텍스트 인코더 없음: ${input.textEncoder||'선택 필요'}`);
  if(!status.vaes.includes(input.vae??''))issues.push(`Anima VAE 없음: ${input.vae||'선택 필요'}`);
 }
 for(const lora of input.loras??[]){
  if(!lora.enabled)continue;
  issues.push(...(anima?status.animaLoraIssues:status.loraIssues));
  if(lora.profile!==input.profile)issues.push(`모델 계열이 다른 LoRA: ${lora.name}`);
  if(!(anima?status.animaLoras:status.loras).includes(lora.name))issues.push(`선택한 LoRA 파일 없음: ${lora.name}`);
 }
 return [...new Set(issues)];
}
