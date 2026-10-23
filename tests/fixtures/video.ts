export function videoNodes(dynamic=true):Record<string,unknown> {
 const nodes:Record<string,unknown>={};
 for(const name of ['ModelSamplingSD3','CLIPTextEncode','Wan22ImageToVideoLatent','VAEDecode','CreateVideo','LoadImage','LoadVideo','GetVideoComponents','VAEEncode']) nodes[name]={input:{required:{}}};
 nodes.UNETLoader={input:{required:{unet_name:[['wan2.2_ti2v_5B_fp16.safetensors']],weight_dtype:[['default']]}}};
 nodes.CLIPLoader={input:{required:{clip_name:[['umt5_xxl_fp8_e4m3fn_scaled.safetensors']],type:[['wan']]},optional:{device:[['default','cpu']]}}};
 nodes.VAELoader={input:{required:{vae_name:[['wan2.2_vae.safetensors']]}}};
 nodes.KSampler={input:{required:{sampler_name:[['uni_pc']],scheduler:[['simple']]}}};
 nodes.SaveVideo={input:{required:dynamic?{format:['COMFY_DYNAMICCOMBO_V3',{options:[{key:'mp4',inputs:{required:{codec:['COMFY_DYNAMICCOMBO_V3',{options:[{key:'h264',inputs:{}}]}]}}}]}]}:{format:[['auto','mp4']],codec:[['auto','h264']]}}};
 return nodes;
}
