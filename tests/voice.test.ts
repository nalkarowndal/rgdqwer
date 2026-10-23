import { it,expect } from 'vitest';
import { voiceInputSchema,voiceProfileSchema,defaultVoiceInput } from '../src/voice.js';
const id='12345678-1234-4234-8234-123456789abc';
it('requires authorization and engine-specific valid controls',()=>{
 const input={...defaultVoiceInput(),voiceProfileId:id,prompt:'안녕하세요',authorized:true};
 expect(voiceInputSchema.safeParse(input).success).toBe(true);
 for(const patch of [{authorized:false},{prompt:' '},{prompt:'a'.repeat(3001)},{pitch:1},{language:'fr'},{sourceId:'../x'}])expect(voiceInputSchema.safeParse({...input,...patch}).success).toBe(false);
 expect(voiceInputSchema.safeParse({...input,engine:'rvc',sourceId:id,pitch:-12}).success).toBe(true);
 expect(voiceInputSchema.safeParse({...input,engine:'rvc',sourceId:id,pitch:13}).success).toBe(false);
 expect(voiceInputSchema.safeParse({...input,engine:'chatterbox-vc'}).success).toBe(false);
});
it('profiles require permission, supported languages and reference or RVC model',()=>{
 const p={name:'내 목소리',referenceId:id,languages:['ko'],engines:['chatterbox-tts'],permission:'본인 녹음',authorized:true,defaults:{exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0}};
 expect(voiceProfileSchema.safeParse(p).success).toBe(true);
 for(const patch of [{authorized:false},{permission:''},{referenceId:undefined},{languages:[]},{engines:[]},{rvcModel:'../evil'}])expect(voiceProfileSchema.safeParse({...p,...patch}).success).toBe(false);
});
