import {z} from 'zod';
import type {ModelKind} from './models.js';
export interface CatalogFile {id:string;repo:string;path:string;kind:ModelKind;family:string;bundle:string;license:string;licenseUrl:string;estimatedBytes:number}
export interface ModelFeature {id:string;name:string;description:string;fileIds:string[];setup:string}
const repositories={
 sdxl:{repo:'stabilityai/stable-diffusion-xl-base-1.0',family:'sdxl',license:'CreativeML Open RAIL++-M',licenseUrl:'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md'},
 krea:{repo:'Comfy-Org/Krea-2',family:'krea2',license:'Krea AI Community License',licenseUrl:'https://www.krea.ai/krea-2-licensing'},
 wan:{repo:'Comfy-Org/Wan_2.2_ComfyUI_Repackaged',family:'wan22',license:'Apache-2.0',licenseUrl:'https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B'},
 florence:{repo:'florence-community/Florence-2-base',family:'florence2',license:'MIT',licenseUrl:'https://huggingface.co/florence-community/Florence-2-base'},
 wd14:{repo:'SmilingWolf/wd-v1-4-vit-tagger-v2',family:'wd14',license:'Apache-2.0',licenseUrl:'https://huggingface.co/SmilingWolf/wd-v1-4-vit-tagger-v2'},
 chatterbox:{repo:'ResembleAI/chatterbox',family:'chatterbox',license:'MIT',licenseUrl:'https://huggingface.co/ResembleAI/chatterbox'},
};
function file(id:string,repository:keyof typeof repositories,path:string,kind:ModelKind,estimatedBytes:number):CatalogFile{return {id,...repositories[repository],path,kind,bundle:`catalog-${repository}`,estimatedBytes};}
export const catalogFiles:CatalogFile[]=[
 file('sdxl-base','sdxl','sd_xl_base_1.0.safetensors','checkpoint',6.94e9),
 file('krea-turbo','krea','diffusion_models/krea2_turbo_fp8_scaled.safetensors','video',13.1e9),
 file('krea-raw','krea','diffusion_models/krea2_raw_fp8_scaled.safetensors','video',13.1e9),
 file('krea-text','krea','text_encoders/qwen3vl_4b_fp8_scaled.safetensors','text_encoder',5.2e9),
 file('krea-vae','krea','vae/qwen_image_vae.safetensors','vae',254e6),
 file('wan-model','wan','split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors','video',10e9),
 file('wan-text','wan','split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors','text_encoder',6.74e9),
 file('wan-vae','wan','split_files/vae/wan2.2_vae.safetensors','vae',1.41e9),
 ...['config.json','generation_config.json','preprocessor_config.json','processor_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','added_tokens.json','vocab.json','merges.txt','model.safetensors'].map(name=>file(`florence-${name}`,'florence',name,'analysis',name==='model.safetensors'?463e6:name==='tokenizer.json'?3.75e6:200000)),
 file('wd14-model','wd14','model.onnx','analysis',373e6),file('wd14-tags','wd14','selected_tags.csv','analysis',254000),
 file('tts-ve','chatterbox','ve.pt','voice',5.7e6),file('tts-s3','chatterbox','s3gen.pt','voice',1.06e9),file('tts-t3','chatterbox','t3_mtl23ls_v2.safetensors','voice',2.14e9),file('tts-tokenizer','chatterbox','grapheme_mtl_merged_expanded_v1.json','voice',70000),
 file('vc-s3','chatterbox','s3gen.safetensors','voice',1.06e9),
];
const comfySetup='다운로드 후 경로·메모리 탭에서 ComfyUI 경로 설정을 생성하고 적용·재시작하세요. 해당 스튜디오에서 모델을 선택하고 실행 환경을 확인하세요.';
export const modelFeatures:ModelFeature[]=[
 {id:'sdxl',name:'이미지 생성 · SDXL',description:'SDXL Base 1.0 · 기본 이미지 모델',fileIds:['sdxl-base'],setup:comfySetup},
 {id:'krea-turbo',name:'Krea 2 · Turbo',description:'FP8 기본 모델 · 빠른 이미지 생성',fileIds:['krea-turbo','krea-text','krea-vae'],setup:comfySetup},
 {id:'krea-raw',name:'Krea 2 · RAW',description:'FP8 기본 모델 · 전체 단계 이미지 생성',fileIds:['krea-raw','krea-text','krea-vae'],setup:comfySetup},
 {id:'wan',name:'영상 생성 · Wan 2.2',description:'TI2V 5B · 텍스트·이미지로 영상 생성',fileIds:['wan-model','wan-text','wan-vae'],setup:comfySetup},
 {id:'florence',name:'이미지 설명 · Florence-2',description:'Base · 이미지 설명·OCR',fileIds:catalogFiles.filter(f=>f.family==='florence2').map(f=>f.id),setup:'별도 분석 Python 환경을 준비하고 Worker의 --florence-dir에 아래 모델 폴더를 지정하세요. resources/docs/IMAGE_TO_PROMPT.md를 참고하세요.'},
 {id:'wd14',name:'이미지 태그 · WD14',description:'ViT v2 · 이미지 태그 추출',fileIds:['wd14-model','wd14-tags'],setup:'별도 분석 Python 환경을 준비하고 Worker의 --wd14-dir에 아래 모델 폴더를 지정하세요. resources/docs/IMAGE_TO_PROMPT.md를 참고하세요.'},
 {id:'tts',name:'음성 합성 · Chatterbox',description:'Multilingual v2 · 한국어 등 다국어 TTS',fileIds:['tts-ve','tts-s3','tts-t3','tts-tokenizer'],setup:'별도 Chatterbox Python 환경과 FFmpeg를 준비하고 STUDIO_CHATTERBOX_DIR에 아래 모델 폴더를 지정한 뒤 앱을 재시작하세요. resources/docs/VOICE_SYSTEM.md를 참고하세요.'},
 {id:'vc',name:'음성 변환 · ChatterboxVC',description:'참고 음성 기반 음성 변환',fileIds:['vc-s3'],setup:'TTS와 같은 Chatterbox 환경/모델 폴더를 사용합니다. STUDIO_CHATTERBOX_DIR과 FFmpeg를 준비한 뒤 음성 스튜디오에서 상태를 확인하세요.'},
];
export const featureDownloadSchema=z.object({featureIds:z.array(z.string().refine(id=>modelFeatures.some(f=>f.id===id),'알 수 없는 기능입니다.')).min(1).max(8),confirmed:z.literal(true)}).strict();
export function selectCatalogFiles(ids:string[]){const selected=new Set<string>();for(const id of ids){const feature=modelFeatures.find(f=>f.id===id);if(!feature)throw new Error('알 수 없는 기능입니다.');feature.fileIds.forEach(fileId=>selected.add(fileId));}return catalogFiles.filter(f=>selected.has(f.id));}
export interface CatalogFileStatus {id:string;name:string;installed:boolean;bytes:number;estimatedBytes:number;path:string;issue?:string}
export interface FeatureStatus extends ModelFeature {ready:boolean;files:CatalogFileStatus[]}
export interface CatalogStatus {root:string;features:FeatureStatus[]}
export const formatModelBytes=(bytes:number)=>bytes>=1e9?`${(bytes/1e9).toFixed(2)} GB`:`${(bytes/1e6).toFixed(1)} MB`;
