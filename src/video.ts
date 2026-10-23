import { z } from 'zod';
export const videoFieldLabels={subject:'주체',scene:'장면',movement:'움직임',speed:'속도',camera:'카메라 움직임',background:'배경 변화',mood:'분위기',startEnd:'시작·종료 상태'};
const fields=z.object({subject:z.string().max(500),scene:z.string().max(500),movement:z.string().max(500),speed:z.string().max(500),camera:z.string().max(500),background:z.string().max(500),mood:z.string().max(500),startEnd:z.string().max(500)}).strict();
export const videoInputSchema=z.object({
 profile:z.enum(['wan22','video-tools']),mode:z.enum(['t2v','i2v','v2v','convert','extract']),checkpoint:z.string().max(1024),textEncoder:z.string().max(1024),vae:z.string().max(1024),
 prompt:z.string().max(8000),negative:z.string().max(8000),seed:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),steps:z.number().int().min(1).max(50),cfg:z.number().min(1).max(10),
 width:z.number().int().min(32).max(1280).multipleOf(32),height:z.number().int().min(32).max(1280).multipleOf(32),frames:z.number().int().min(1).max(300),fps:z.number().int().min(1).max(60),denoise:z.number().min(.05).max(1),lowVram:z.boolean(),
 sourceId:z.string().uuid().nullable(),startSeconds:z.number().min(0).max(30),interpolation:z.enum(['none','motion']),fit:z.enum(['contain','cover']),includeAudio:z.boolean(),promptFields:fields,
}).strict().superRefine((v,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:'custom',message});
 if(v.mode!=='t2v'&&!v.sourceId) fail('원본 파일을 먼저 업로드하세요.');
 if(v.profile==='wan22') {
  if(!['t2v','i2v','v2v'].includes(v.mode)) fail('Wan 생성 모드를 선택하세요.');
  if(!v.checkpoint||!v.textEncoder||!v.vae||!v.prompt.trim()) fail('모델과 프롬프트가 필요합니다.');
  if(v.width<256||v.height<256||v.width*v.height>901120||v.frames<5||v.frames>121||(v.frames-1)%4||v.fps>30) fail('Wan: 256px 이상, 최대 901120픽셀, 5~121의 4n+1 프레임, 최대 30FPS');
  if(v.mode==='v2v'?v.denoise>.95:v.denoise!==1) fail('V2V denoise는 .05~.95, T2V/I2V는 1입니다.');
 } else if(!['convert','extract'].includes(v.mode)||v.width*v.height>921600||v.frames/v.fps>10) fail('변환·추출은 최대 10초, 921600픽셀입니다.');
 if(v.includeAudio&&v.mode!=='convert') fail('오디오 포함은 변환 모드에서만 가능합니다.');
});
export type VideoInput=z.infer<typeof videoInputSchema>;
export const isVideoInput=(input:{profile:string}):input is VideoInput=>input.profile==='wan22'||input.profile==='video-tools';
export function defaultVideoInput():VideoInput {return {profile:'wan22',mode:'t2v',checkpoint:'wan2.2_ti2v_5B_fp16.safetensors',textEncoder:'umt5_xxl_fp8_e4m3fn_scaled.safetensors',vae:'wan2.2_vae.safetensors',prompt:'A cat walking slowly through a sunlit garden.',negative:'',seed:0,steps:20,cfg:5,width:640,height:384,frames:33,fps:24,denoise:1,lowVram:true,sourceId:null,startSeconds:0,interpolation:'none',fit:'contain',includeAudio:false,promptFields:{subject:'',scene:'',movement:'',speed:'',camera:'',background:'',mood:'',startEnd:''}};}
export function compileVideoPrompt(value:VideoInput['promptFields'],mode:VideoInput['mode']) {
 const dictionary:Record<string,string>={'고양이':'cat','강아지':'dog','천천히':'slowly','빠르게':'quickly','천천히 줌인':'slow camera zoom in','고정 카메라':'static camera','걷기':'walking','달리기':'running','영화적':'cinematic','따뜻한':'warm'};
 const parts=Object.entries(value).filter(([,v])=>v.trim()).map(([k,v])=>`${k}: ${dictionary[v.trim()]??v.trim()}`);
 const text=(mode==='i2v'?'Preserve the appearance of the source image. Focus on motion and camera changes. ':'')+parts.join('. ');
 return {text,warnings:/[가-힣]/.test(text)?['사전에 없는 한국어는 원문을 유지합니다. 번역 모델이 아닌 제한된 키워드 변환입니다.']:[]};
}
export interface VideoInventory {diffusionModels:string[];textEncoders:string[];vaes:string[];issues:string[];i2vIssues:string[];v2vIssues:string[];cpuSupported:boolean;saveDialect:'dynamic'|'legacy'|null}
export interface MediaInput {id:string;kind:'image'|'video';fileName:string;width:number;height:number;frames?:number;fps?:number;duration?:number;createdAt:string}
export function videoIssues(input:VideoInput,status:VideoInventory) {
 const issues=[...status.issues,...(input.mode==='i2v'?status.i2vIssues:input.mode==='v2v'?status.v2vIssues:[])];
 for(const [name,list] of [[input.checkpoint,status.diffusionModels],[input.textEncoder,status.textEncoders],[input.vae,status.vaes]] as const) if(!list.includes(name)) issues.push(`선택한 모델 파일 없음: ${name}`);
 if(input.lowVram&&!status.cpuSupported) issues.push('CLIPLoader CPU 옵션 지원 필요');
 return issues;
}
