import { compilePrompt, promptDocumentSchema, profileSchema } from '../../src/prompt.js';
import { z } from 'zod';
import type { ImageInput } from '../../src/contracts.js';

export const imageInputSchema = z.object({
  promptDocument: promptDocumentSchema.optional(),
  profile: profileSchema,
  textEncoder: z.string().min(1).max(1024).optional(), vae: z.string().min(1).max(1024).optional(),
  loras: z.array(z.object({name:z.string().min(1).max(1024),profile:profileSchema,enabled:z.boolean(),strength:z.number().finite().min(-2).max(2)}).strict()).max(4).optional(),
  checkpoint: z.string().min(1).max(1024),
  prompt: z.string().max(8000).refine(value => !!value.trim(), '프롬프트를 입력하세요.'),
  negative: z.string().max(8000),
  width: z.number().int().min(256).max(1024).multipleOf(64),
  height: z.number().int().min(256).max(1024).multipleOf(64),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  steps: z.number().int().min(1).max(80), cfg: z.number().min(1).max(30),
}).strict().refine(v=>v.profile!=='anima'||!!(v.textEncoder&&v.vae),'Anima 텍스트 인코더와 VAE를 선택하세요.').refine(v=>(v.loras??[]).every(l=>!l.enabled||l.profile===v.profile),'현재 모델 계열과 다른 LoRA를 비활성화하세요.').refine(v=>{const active=(v.loras??[]).filter(l=>l.enabled);return new Set(active.map(l=>l.name)).size===active.length;},'같은 LoRA를 중복 활성화할 수 없습니다.').refine(v => v.profile !== 'sd15' || (v.width <= 768 && v.height <= 768),
  'SD 1.5는 가로·세로 최대 768px입니다.').refine(value => {
    if (!value.promptDocument) return true;
    const result = compilePrompt(value.promptDocument, value.profile);
    return result.valid && value.prompt === result.positive && value.negative === result.negative;
  }, '프롬프트 원문과 최종 결과가 다릅니다. 현재 결과로 다시 요청하세요.');

export const requiredNodes = ['KSampler', 'CheckpointLoaderSimple', 'EmptyLatentImage', 'CLIPTextEncode', 'VAEDecode', 'SaveImage'];
export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export function buildWorkflow(input: ImageInput, id: string): Workflow {
  const graph:Workflow = {
    '3': { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0], seed: input.seed, steps: input.steps, cfg: input.cfg, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: input.checkpoint } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: input.width, height: input.height, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: input.prompt, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: input.negative, clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: `rgdqwer/${id}` } },
  };
  const anima=input.profile==='anima';
  if(anima){
    delete graph['4'];
    graph['10']={class_type:'UNETLoader',inputs:{unet_name:input.checkpoint,weight_dtype:'default'}};
    graph['11']={class_type:'CLIPLoader',inputs:{clip_name:input.textEncoder,type:'stable_diffusion',device:'default'}};
    graph['12']={class_type:'VAELoader',inputs:{vae_name:input.vae}};
    Object.assign(graph['3'].inputs,{model:['10',0],sampler_name:'er_sde',scheduler:'simple'});
    graph['6'].inputs.clip=['11',0];graph['7'].inputs.clip=['11',0];graph['8'].inputs.vae=['12',0];
  }
  (input.loras??[]).filter(l=>l.enabled).forEach((lora,index)=>{
    const key=String(30+index);
    graph[key]={class_type:anima?'LoraLoaderModelOnly':'LoraLoader',inputs:{model:graph['3'].inputs.model,lora_name:lora.name,strength_model:lora.strength,...(anima?{}:{clip:graph['6'].inputs.clip,strength_clip:lora.strength})}};
    graph['3'].inputs.model=[key,0];
    if(!anima){graph['6'].inputs.clip=[key,1];graph['7'].inputs.clip=[key,1];}
  });
  return graph;
}
