import {z} from 'zod';
import type {ImageInventory} from '../../src/image.js';
import {requiredNodes} from './workflow.js';
export function inspectImage(raw:unknown):ImageInventory{
 const nodes=z.record(z.unknown()).parse(raw);
 const missing=(names:string[])=>names.filter(n=>!nodes[n]).map(n=>`필수 ComfyUI 노드 없음: ${n}`);
 const options=(node:string,key:string):string[]=>{
  const parsed=z.object({input:z.object({required:z.record(z.unknown()),optional:z.record(z.unknown()).optional()})}).safeParse(nodes[node]);
  if(!parsed.success)return [];
  const value=parsed.data.input.required[key]??parsed.data.input.optional?.[key];
  return Array.isArray(value)?z.array(z.string()).safeParse(value[0]).data??[]:[];
 };
 const issues=missing(requiredNodes);
 const animaIssues=missing([...requiredNodes.filter(n=>n!=='CheckpointLoaderSimple'),'UNETLoader','CLIPLoader','VAELoader']);
 for(const [node,key,value] of [['KSampler','sampler_name','euler'],['KSampler','scheduler','normal']])if(!options(node,key).includes(value))issues.push(`${node}에서 ${key}=${value} 지원 필요`);
 for(const [node,key,value] of [['UNETLoader','weight_dtype','default'],['CLIPLoader','type','stable_diffusion'],['KSampler','sampler_name','er_sde'],['KSampler','scheduler','simple']])if(!options(node,key).includes(value))animaIssues.push(`${node}에서 ${key}=${value} 지원 필요 · ComfyUI를 업데이트하세요.`);
 return {checkpoints:options('CheckpointLoaderSimple','ckpt_name'),diffusionModels:options('UNETLoader','unet_name'),textEncoders:options('CLIPLoader','clip_name'),vaes:options('VAELoader','vae_name'),loras:options('LoraLoader','lora_name'),animaLoras:options('LoraLoaderModelOnly','lora_name'),issues,animaIssues,loraIssues:missing(['LoraLoader']),animaLoraIssues:missing(['LoraLoaderModelOnly'])};
}
