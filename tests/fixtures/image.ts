import type {ImageInput} from '../../src/contracts.js';
export const animaInput:ImageInput={profile:'anima',checkpoint:'anima-base-v1.0.safetensors',textEncoder:'qwen_3_06b_base.safetensors',vae:'qwen_image_vae.safetensors',prompt:'a painted forest',negative:'blurry',width:512,height:512,seed:42,steps:30,cfg:4};
export function imageNodes():Record<string,unknown>{
 const node=(required:Record<string,unknown>)=>({input:{required}});
 return {UNETLoader:node({unet_name:[[animaInput.checkpoint]],weight_dtype:[['default']]}),CLIPLoader:node({clip_name:[[animaInput.textEncoder]],type:[['stable_diffusion']],device:[['default','cpu']]}),VAELoader:node({vae_name:[[animaInput.vae]]}),LoraLoader:node({lora_name:[['style.safetensors','detail.safetensors']]}),LoraLoaderModelOnly:node({lora_name:[['anima-style.safetensors']]}),KSampler:node({sampler_name:[['euler','er_sde']],scheduler:[['normal','simple']]})};
}
