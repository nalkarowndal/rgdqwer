import { describe,it,expect } from 'vitest';
import { defaultVideoInput,videoInputSchema,compileVideoPrompt } from '../src/video.js';
import { buildVideoWorkflow,inspectVideo } from '../server/generation/video.js';
import { videoNodes } from './fixtures/video.js';
describe('video contract and native Wan graph',()=>{
 it('bounds modes, spatial tokens and temporal latents',()=>{
  expect(videoInputSchema.safeParse(defaultVideoInput()).success).toBe(true);
  for(const patch of [{frames:32},{width:641},{mode:'i2v'},{profile:'video-tools'},{width:1280,height:1280},{denoise:.5}]) expect(videoInputSchema.safeParse({...defaultVideoInput(),...patch}).success).toBe(false);
  expect(videoInputSchema.safeParse({...defaultVideoInput(),profile:'video-tools',mode:'convert',sourceId:crypto.randomUUID(),width:64,height:64,frames:300,fps:1}).success).toBe(false);
 });
 it('builds T2V and I2V from native Wan latent with CPU encoder and explicit MP4',()=>{
  const input=defaultVideoInput(); const inventory=inspectVideo(videoNodes());
  expect(inventory.issues).toEqual([]);
  const graph=buildVideoWorkflow(input,'id',inventory);
  expect(graph['38'].inputs.device).toBe('cpu');
  expect(graph['55'].inputs).not.toHaveProperty('start_image');
  expect(graph['48'].inputs.shift).toBe(8);
  expect(graph['3'].inputs).toMatchObject({sampler_name:'uni_pc',scheduler:'simple',denoise:1});
  expect(graph['9'].inputs).toMatchObject({format:'mp4','format.codec':'h264',filename_prefix:'rgdqwer/id'});
  const image=buildVideoWorkflow({...input,mode:'i2v',sourceId:crypto.randomUUID()},'id',inventory,'rgdqwer_id.png');
  expect(image['55'].inputs.start_image).toEqual(['56',0]);
 });
 it('encodes actual video frames for experimental V2V and detects legacy SaveVideo',()=>{
  const inventory=inspectVideo(videoNodes(false));
  const graph=buildVideoWorkflow({...defaultVideoInput(),mode:'v2v',denoise:.6},'id',inventory,'rgdqwer_id.mp4');
  expect(graph['55'].class_type).toBe('VAEEncode');
  expect(graph['56']).toEqual({class_type:'LoadVideo',inputs:{file:'rgdqwer_id.mp4'}});
  expect(graph['9'].inputs).toMatchObject({format:'mp4',codec:'h264'});
  const nodes=videoNodes(); delete nodes.Wan22ImageToVideoLatent;
  expect(inspectVideo(nodes).issues.join()).toContain('Wan22ImageToVideoLatent');
 });
 it('compiles motion fields without pretending unknown Korean is translated',()=>{
  const fields={...defaultVideoInput().promptFields,subject:'고양이',camera:'천천히 줌인',movement:'알 수 없는 움직임'};
  const result=compileVideoPrompt(fields,'i2v');
  expect(result.text).toContain('cat'); expect(result.text).toContain('Preserve'); expect(result.text).toContain(fields.movement); expect(result.warnings.length).toBeGreaterThan(0);
 });
});

it('rejects misleading dynamic codec labels without the actual h264 option',()=>{
 const nodes=videoNodes();nodes.SaveVideo={input:{required:{format:['COMFY_DYNAMICCOMBO_V3',{options:[{key:'mp4',inputs:{required:{codec:['COMFY_DYNAMICCOMBO_V3',{tooltip:'h264 unavailable',options:[{key:'av1',inputs:{}}]}]}}}]}]}}};
 expect(inspectVideo(nodes).saveDialect).toBeNull();
});
