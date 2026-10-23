import { z } from 'zod';
import type { VideoInput,VideoInventory } from '../../src/video.js';
import type { Workflow } from './workflow.js';
export function inspectVideo(raw:unknown):VideoInventory {
 const nodes=z.record(z.unknown()).parse(raw);
 const required=(node:string)=>z.object({input:z.object({required:z.record(z.unknown()),optional:z.record(z.unknown()).optional()})}).safeParse(nodes[node]).data?.input;
 const option=(node:string,key:string)=>{const value=required(node);return (value?.required[key]??value?.optional?.[key]) as unknown[]|undefined;};
 const options=(node:string,key:string)=>z.array(z.string()).safeParse(option(node,key)?.[0]).data??[];
 const missing=(names:string[])=>names.filter(n=>!nodes[n]).map(n=>`필수 ComfyUI 노드 없음: ${n}`);
 const issues=missing(['UNETLoader','CLIPLoader','VAELoader','ModelSamplingSD3','CLIPTextEncode','Wan22ImageToVideoLatent','KSampler','VAEDecode','CreateVideo','SaveVideo']);
 for(const [node,key,value] of [['UNETLoader','weight_dtype','default'],['CLIPLoader','type','wan'],['KSampler','sampler_name','uni_pc'],['KSampler','scheduler','simple']]) if(!options(node,key).includes(value)) issues.push(`${node}: ${key}=${value} 지원 필요`);
 const format=option('SaveVideo','format');
 let saveDialect:VideoInventory['saveDialect']=null;
 if(format?.[0]==='COMFY_DYNAMICCOMBO_V3') {
  const config=z.object({options:z.array(z.object({key:z.string(),inputs:z.unknown()}))}).safeParse(format[1]);
  if(config.success) {
   const mp4=config.data.options.find(o=>o.key==='mp4');
   const nested=z.object({required:z.object({codec:z.tuple([z.literal('COMFY_DYNAMICCOMBO_V3'),z.object({options:z.array(z.object({key:z.string()}))})]).rest(z.unknown())})}).safeParse(mp4?.inputs);
   if(nested.success&&nested.data.required.codec[1].options.some(o=>o.key==='h264'))saveDialect='dynamic';
  }
 } else if(options('SaveVideo','format').includes('mp4')&&options('SaveVideo','codec').includes('h264')) saveDialect='legacy';
 if(!saveDialect) issues.push('SaveVideo MP4/H264 형식 지원 필요');
 return {diffusionModels:options('UNETLoader','unet_name'),textEncoders:options('CLIPLoader','clip_name'),vaes:options('VAELoader','vae_name'),issues,i2vIssues:missing(['LoadImage']),v2vIssues:missing(['LoadVideo','GetVideoComponents','VAEEncode']),cpuSupported:options('CLIPLoader','device').includes('cpu'),saveDialect};
}
export function buildVideoWorkflow(input:VideoInput,id:string,inventory:VideoInventory,sourceName?:string):Workflow {
 const graph:Workflow={
 '37':{class_type:'UNETLoader',inputs:{unet_name:input.checkpoint,weight_dtype:'default'}},
 '38':{class_type:'CLIPLoader',inputs:{clip_name:input.textEncoder,type:'wan',device:input.lowVram?'cpu':'default'}},
 '39':{class_type:'VAELoader',inputs:{vae_name:input.vae}},
 '48':{class_type:'ModelSamplingSD3',inputs:{model:['37',0],shift:8}},
 '6':{class_type:'CLIPTextEncode',inputs:{clip:['38',0],text:input.prompt}},
 '7':{class_type:'CLIPTextEncode',inputs:{clip:['38',0],text:input.negative}},
 '55':{class_type:'Wan22ImageToVideoLatent',inputs:{vae:['39',0],width:input.width,height:input.height,length:input.frames,batch_size:1}},
 '3':{class_type:'KSampler',inputs:{model:['48',0],positive:['6',0],negative:['7',0],latent_image:['55',0],seed:input.seed,steps:input.steps,cfg:input.cfg,sampler_name:'uni_pc',scheduler:'simple',denoise:input.denoise}},
 '8':{class_type:'VAEDecode',inputs:{samples:['3',0],vae:['39',0]}},
 '57':{class_type:'CreateVideo',inputs:{images:['8',0],fps:input.fps}},
 '9':{class_type:'SaveVideo',inputs:{video:['57',0],filename_prefix:`rgdqwer/${id}`,format:'mp4',...(inventory.saveDialect==='dynamic'?{'format.codec':'h264'}:{codec:'h264'})}},
 };
 if(input.mode==='i2v') {graph['56']={class_type:'LoadImage',inputs:{image:sourceName}};graph['55'].inputs.start_image=['56',0];}
 if(input.mode==='v2v') {graph['56']={class_type:'LoadVideo',inputs:{file:sourceName}};graph['58']={class_type:'GetVideoComponents',inputs:{video:['56',0]}};graph['55']={class_type:'VAEEncode',inputs:{pixels:['58',0],vae:['39',0]}};}
 return graph;
}
