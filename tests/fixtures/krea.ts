import type { KreaInput } from '../../src/krea.js';
export const kreaInput:KreaInput={profile:'krea-turbo',checkpoint:'krea2_turbo_fp8_scaled.safetensors',textEncoder:'qwen3vl_4b_fp8_scaled.safetensors',vae:'qwen_image_vae.safetensors',prompt:'a forest',sourcePrompt:'a forest',negative:'',enhancer:'none',width:1024,height:1024,seed:42,steps:8,cfg:1,lora:null};
export function kreaNodes():Record<string,{input:{required:Record<string,unknown>}}> {
  const entries:Record<string,Record<string,unknown>>={
    UNETLoader:{unet_name:[[kreaInput.checkpoint,'krea2_raw_fp8_scaled.safetensors']],weight_dtype:[['default']]},
    CLIPLoader:{clip_name:[[kreaInput.textEncoder]],type:[['krea2']],device:[['default','cpu']]},VAELoader:{vae_name:[[kreaInput.vae]]},
    KSampler:{sampler_name:[['euler']],scheduler:[['normal','simple']]},
    LoraLoaderModelOnly:{lora_name:[['krea2_darkbrush.safetensors','custom.safetensors']]},
    TextGenerate:{sampling_mode:['COMFY_DYNAMICCOMBO_V3',{options:[{key:'on'},{key:'off'}]}]},
    EmptyLatentImage:{},CLIPTextEncode:{},ConditioningZeroOut:{},VAEDecode:{},SaveImage:{},StringConcatenate:{},ModelSamplingFlux:{},
  };
  return Object.fromEntries(Object.entries(entries).map(([name,required])=>[name,{input:{required}}]));
}
