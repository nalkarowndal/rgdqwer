import { z } from 'zod';
import type { KreaInput, KreaInventory } from '../../src/krea.js';
import type { Workflow } from './workflow.js';
import { kreaEnhancerInstruction } from './krea-enhancer.js';

const baseNodes=['UNETLoader','CLIPLoader','VAELoader','KSampler','EmptyLatentImage','CLIPTextEncode','ConditioningZeroOut','VAEDecode','SaveImage'];
export function inspectKrea(raw: unknown): KreaInventory {
  const nodes=z.record(z.unknown()).parse(raw);
  const missing=(names:string[])=>names.filter(n=>!nodes[n]).map(n=>`필수 ComfyUI 노드 없음: ${n}`);
  const options=(node:string,key:string):string[]=>{
    const parsed=z.object({input:z.object({required:z.record(z.unknown()),optional:z.record(z.unknown()).optional()})}).safeParse(nodes[node]);
    if(!parsed.success) return [];
    const option=(parsed.data.input.required[key]??parsed.data.input.optional?.[key]) as unknown[]|undefined;
    return z.array(z.string()).safeParse(option?.[0]).data??[];
  };
  const issues=missing(baseNodes);
  for(const [node,key,value] of [['CLIPLoader','type','krea2'],['UNETLoader','weight_dtype','default'],['KSampler','sampler_name','euler'],['KSampler','scheduler','simple']])
    if(!options(node,key).includes(value)) issues.push(`${node}에서 ${key}=${value} 지원 필요`);
  return {diffusionModels:options('UNETLoader','unet_name'),textEncoders:options('CLIPLoader','clip_name'),vaes:options('VAELoader','vae_name'),loras:options('LoraLoaderModelOnly','lora_name'),
    issues,enhancerIssues:missing(['TextGenerate','PreviewAny']),rawIssues:missing(['ModelSamplingFlux']),loraIssues:missing(['LoraLoaderModelOnly','StringConcatenate'])};
}
export { kreaIssues } from '../../src/krea.js';
export function buildKreaWorkflow(input: KreaInput,id: string): Workflow {
  const raw=input.profile==='krea-raw';
  const graph:Workflow={
    '10':{class_type:'UNETLoader',inputs:{unet_name:input.checkpoint,weight_dtype:'default'}},
    '11':{class_type:'CLIPLoader',inputs:{clip_name:input.textEncoder,type:'krea2',device:'default'}},
    '12':{class_type:'VAELoader',inputs:{vae_name:input.vae}},
    '5':{class_type:'EmptyLatentImage',inputs:{width:input.width,height:input.height,batch_size:1}},
    '6':{class_type:'CLIPTextEncode',inputs:{clip:['11',0],text:input.prompt}},
    '7':raw?{class_type:'CLIPTextEncode',inputs:{clip:['11',0],text:''}}:{class_type:'ConditioningZeroOut',inputs:{conditioning:['6',0]}},
    '3':{class_type:'KSampler',inputs:{model:['10',0],positive:['6',0],negative:['7',0],latent_image:['5',0],seed:input.seed,steps:input.steps,cfg:input.cfg,sampler_name:'euler',scheduler:'simple',denoise:1}},
    '8':{class_type:'VAEDecode',inputs:{samples:['3',0],vae:['12',0]}},
    '9':{class_type:'SaveImage',inputs:{images:['8',0],filename_prefix:`rgdqwer/${id}`}},
  };
  if(input.enhancer==='engine') {
    graph['16']={class_type:'TextGenerate',inputs:{clip:['11',0],prompt:kreaEnhancerInstruction+input.prompt,max_length:512,sampling_mode:'on',
      'sampling_mode.temperature':.7,'sampling_mode.top_k':64,'sampling_mode.top_p':.95,'sampling_mode.min_p':.05,'sampling_mode.repetition_penalty':1.05,'sampling_mode.seed':input.seed,'sampling_mode.presence_penalty':0,thinking:false,use_default_template:true}};
    graph['6'].inputs.text=['16',0];
  }
  if(input.lora) {
    graph['15']={class_type:'LoraLoaderModelOnly',inputs:{model:['10',0],lora_name:input.lora.name,strength_model:input.lora.strength}};
    graph['3'].inputs.model=['15',0];
    graph['17']={class_type:'StringConcatenate',inputs:{string_a:graph['6'].inputs.text,string_b:input.lora.trigger,delimiter:', '}};
    graph['6'].inputs.text=['17',0];
  }
  if(input.enhancer==='engine') graph['20']={class_type:'PreviewAny',inputs:{source:graph['6'].inputs.text}};
  if(raw) {
    // Krea standalone's CFG is cond + cfg*(cond-uncond). Comfy uses uncond + cfg*(cond-uncond).
    // Official RAW schedule interpolates mu over sequence lengths 256..6400 (256..1280 pixels).
    const shift=.5+.65*(input.width*input.height/256-256)/(6400-256);
    graph['14']={class_type:'ModelSamplingFlux',inputs:{model:graph['3'].inputs.model,base_shift:shift,max_shift:shift,width:input.width,height:input.height}};
    graph['3'].inputs.model=['14',0];
  }
  return graph;
}
