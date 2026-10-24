import { z } from 'zod';
export const voiceEngineSchema=z.enum(['chatterbox-tts','chatterbox-vc','rvc']);
export type VoiceEngine=z.infer<typeof voiceEngineSchema>;
export const voiceControlsSchema=z.object({exaggeration:z.number().min(0).max(2),cfg:z.number().min(0).max(1),temperature:z.number().min(0.1).max(1.5),pitch:z.number().int().min(-12).max(12)}).strict();
const language=z.enum(['ko','ja','en']);
export const voiceInputSchema=z.object({profile:z.literal('voice'),engine:voiceEngineSchema,voiceProfileId:z.string().uuid(),sourceId:z.string().uuid().optional(),prompt:z.string().max(3000),language,seed:z.number().int().min(0).max(4294967295),authorized:z.literal(true),...voiceControlsSchema.shape}).strict().superRefine((v,c)=>{
 if(v.engine==='chatterbox-tts'&&!v.prompt.trim())c.addIssue({code:'custom',message:'읽을 대사를 입력하세요.'});
 if(v.engine!=='chatterbox-tts'&&!v.sourceId)c.addIssue({code:'custom',message:'변환할 음성을 업로드하거나 녹음하세요.'});
 if(v.engine!=='rvc'&&v.pitch!==0)c.addIssue({code:'custom',message:'피치 조정은 RVC에서만 지원합니다.'});
});
export type VoiceInput=z.infer<typeof voiceInputSchema>;
export const isVoiceInput=(input:{profile:string}):input is VoiceInput=>input.profile==='voice';
export const defaultVoiceInput=():VoiceInput=>({profile:'voice',engine:'chatterbox-tts',voiceProfileId:'',prompt:'',language:'ko',seed:0,authorized:true,exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0});
export const voiceProfileSchema=z.object({name:z.string().trim().min(1).max(80),referenceId:z.string().uuid().optional(),languages:z.array(language).min(1).max(3),engines:z.array(voiceEngineSchema).min(1).max(3),rvcModel:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),permission:z.string().trim().min(3).max(1000),authorized:z.literal(true),defaults:voiceControlsSchema}).strict().superRefine((v,c)=>{
 if(v.engines.some(e=>e!=='rvc')&&!v.referenceId)c.addIssue({code:'custom',message:'참고 음성이 필요합니다.'});
 if(v.engines.includes('rvc')&&!v.rvcModel)c.addIssue({code:'custom',message:'RVC 모델을 선택하세요.'});
});
export type VoiceProfileInput=z.infer<typeof voiceProfileSchema>;
export type VoiceProfile=VoiceProfileInput&{id:string;consentedAt:string;rvcModelPath?:string};
export interface AudioSource {id:string;fileName:string;duration:number;createdAt:string}
export interface VoiceStatus {engines:{id:VoiceEngine;available:boolean;message:string}[];models:{id:string;name:string;path:string}[];tools:{available:boolean;message:string}}
