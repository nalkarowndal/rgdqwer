import {expect,it} from 'vitest';
import {imageInputSchema,buildWorkflow} from '../server/generation/workflow.js';
import {inspectImage} from '../server/generation/image.js';
import {imageIssues} from '../src/image.js';
import {animaInput,imageNodes} from './fixtures/image.js';
const sd={profile:'sd15',checkpoint:'test.safetensors',prompt:'forest',negative:'blur',width:512,height:512,seed:42,steps:20,cfg:7};
const lora={name:'style.safetensors',profile:'sd15',enabled:true,strength:0.65};
function nodes(){return {...Object.fromEntries(['CheckpointLoaderSimple','EmptyLatentImage','CLIPTextEncode','VAEDecode','SaveImage'].map(n=>[n,{input:{required:{ckpt_name:[['test.safetensors']]}}}])),...imageNodes()};}
it('chains enabled SD adapters on model and both text encoders in saved order',()=>{
 const g=buildWorkflow(imageInputSchema.parse({...sd,loras:[lora,{...lora,name:'missing',enabled:false},{...lora,name:'detail.safetensors',strength:-.3}]}),'job');
 const rows=Object.entries(g).filter(([,n])=>n.class_type==='LoraLoader');expect(rows).toHaveLength(2);
 expect(rows[0][1].inputs).toMatchObject({model:['4',0],clip:['4',1],lora_name:lora.name,strength_model:.65,strength_clip:.65});
 expect(rows[1][1].inputs).toMatchObject({model:[rows[0][0],0],clip:[rows[0][0],1],strength_model:-.3});
 expect(g['3'].inputs.model).toEqual([rows[1][0],0]);expect(g['6'].inputs.clip).toEqual([rows[1][0],1]);expect(g['7'].inputs.clip).toEqual(g['6'].inputs.clip);
});
it('disabled missing adapters are graph-equivalent to legacy input and do not require LoRA loaders',()=>{
 const input=imageInputSchema.parse({...sd,loras:[{...lora,enabled:false,name:'deleted.safetensors'}]});
 expect(buildWorkflow(input,'job')).toEqual(buildWorkflow(imageInputSchema.parse(sd),'job'));
 const raw=nodes();delete raw.LoraLoader;expect(imageIssues(input,inspectImage(raw))).toEqual([]);
 expect(input.loras?.[0]).toMatchObject({name:'deleted.safetensors',enabled:false,strength:.65});
});
it('validates active profile/duplicate entries and finite bounded strengths, but permits inactive saved profiles',()=>{
 for(const loras of [[{...lora,strength:NaN}],[{...lora,strength:2.1}],[{...lora,profile:'anima'}],[lora,lora],Array(5).fill({...lora,enabled:false}),[{...lora,name:''}]])expect(imageInputSchema.safeParse({...sd,loras}).success).toBe(false);
 expect(imageInputSchema.safeParse({...sd,loras:[{...lora,profile:'anima',enabled:false}]}).success).toBe(true);
});
it('builds official Anima base graph with independent encoder/VAE and model-only LoRA',()=>{
 const g=buildWorkflow(imageInputSchema.parse({...animaInput,loras:[{...lora,profile:'anima',name:'anima-style.safetensors'}]}),'anima');
 expect(g['10']).toMatchObject({class_type:'UNETLoader',inputs:{unet_name:animaInput.checkpoint,weight_dtype:'default'}});
 expect(g['11'].inputs).toEqual({clip_name:animaInput.textEncoder,type:'stable_diffusion',device:'default'});
 expect(g['3'].inputs).toMatchObject({sampler_name:'er_sde',scheduler:'simple',cfg:4});expect(g['5'].class_type).toBe('EmptyLatentImage');
 expect(g['8'].inputs.vae).toEqual(['12',0]);expect(g['6'].inputs.clip).toEqual(['11',0]);expect(g['7'].inputs.text).toBe('blurry');
 const row=Object.entries(g).find(([,n])=>n.class_type==='LoraLoaderModelOnly')!;expect(row[1].inputs.model).toEqual(['10',0]);expect(g['3'].inputs.model).toEqual([row[0],0]);
 expect(Object.values(g).some(n=>n.class_type==='CheckpointLoaderSimple')).toBe(false);
 expect(imageInputSchema.safeParse({...animaInput,vae:undefined}).success).toBe(false);
});
it('validates profile-specific inventory without requiring SD loaders for Anima',()=>{
 const raw=nodes();delete raw.CheckpointLoaderSimple;const input=imageInputSchema.parse(animaInput);
 expect(imageIssues(input,inspectImage(raw))).toEqual([]);
 raw.CLIPLoader={input:{required:{clip_name:[[animaInput.textEncoder]],type:[['krea2']]}}};
 expect(imageIssues(input,inspectImage(raw)).join()).toContain('stable_diffusion');
 raw.UNETLoader={input:{required:{unet_name:[[]],weight_dtype:[['default']]}}};expect(imageIssues(input,inspectImage(raw)).join()).toContain(animaInput.checkpoint);
});
it('blocks missing active LoRA and unsupported Anima sampler before submission',()=>{
 const raw=nodes();delete raw.LoraLoader;
 expect(imageIssues(imageInputSchema.parse({...sd,loras:[lora]}),inspectImage(raw)).join()).toContain('LoraLoader');
 raw.KSampler={input:{required:{sampler_name:[['euler']],scheduler:[['normal']]}}};expect(imageIssues(animaInput,inspectImage(raw)).join()).toContain('er_sde');
});
