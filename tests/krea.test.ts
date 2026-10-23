import { expect, it } from 'vitest';
import { kreaInputSchema, prepareKreaPrompt, kreaPresets } from '../src/krea.js';
import { buildKreaWorkflow, inspectKrea, kreaIssues } from '../server/generation/krea.js';
import { kreaNodes, kreaInput } from './fixtures/krea.js';
it('uses official Turbo graph with CFG disabled in Comfy semantics', () => {
  const graph = buildKreaWorkflow(kreaInput, 'job');
  expect(graph['3'].inputs).toMatchObject({ steps:8,cfg:1,sampler_name:'euler',scheduler:'simple' });
  expect(graph['11'].inputs).toMatchObject({type:'krea2'});
  expect(graph['7'].class_type).toBe('ConditioningZeroOut');
  expect(graph['9'].inputs.filename_prefix).toBe('rgdqwer/job');
  expect(Object.values(graph).some(n=>n.class_type==='TextGenerate')).toBe(false);
});
it('adapts RAW CFG and resolution dependent shift from official sampling code', () => {
  const graph = buildKreaWorkflow({...kreaInput,profile:'krea-raw',...kreaPresets['krea-raw'],width:1024,height:768},'raw');
  expect(graph['3'].inputs).toMatchObject({steps:52,cfg:4.5,model:['14',0]});
  expect(graph['7']).toMatchObject({class_type:'CLIPTextEncode',inputs:{text:''}});
  expect(graph['14'].inputs.base_shift).toBeCloseTo(.5+.65*(3072-256)/(6400-256));
  expect(graph['14'].inputs.max_shift).toBe(graph['14'].inputs.base_shift);
});
it('uses exactly one engine enhancement then appends style trigger', () => {
  const graph=buildKreaWorkflow({...kreaInput,enhancer:'engine',lora:{name:'krea2_darkbrush.safetensors',strength:1,trigger:'monochrome ink wash style'}},'id');
  expect(Object.values(graph).filter(n=>n.class_type==='TextGenerate')).toHaveLength(1);
  expect(graph['16'].inputs).toMatchObject({'sampling_mode':'on','sampling_mode.seed':42,thinking:false});
  expect(graph['17'].inputs).toMatchObject({string_a:['16',0],string_b:'monochrome ink wash style'});
  expect(graph['6'].inputs.text).toEqual(['17',0]);
  expect(graph['3'].inputs.model).toEqual(['15',0]);
});
it('preserves literal input and identifies limited Korean dictionary conversion', () => {
  expect(prepareKreaPrompt('  custom art  ','none').text).toBe('  custom art  ');
  expect(prepareKreaPrompt('고양이, 숲','app').text).toContain('cat');
  expect(prepareKreaPrompt('새로운한국어문장','app').warnings.length).toBeGreaterThan(0);
  expect(prepareKreaPrompt('한국어 장면','engine').text).toBe('한국어 장면');
});
it('validates profile-specific size, fixed sampler settings, LoRA and strict exclusive mode', () => {
  expect(kreaInputSchema.safeParse(kreaInput).success).toBe(true);
  for(const patch of [{steps:20},{cfg:0},{width:4096},{width:513},{prompt:' '},{negative:'bad'},{enhancer:'both'}, {extra:true}, {lora:{name:'style',strength:99,trigger:''}}, {profile:'krea-raw',steps:52,cfg:4.5,width:2048}])
    expect(kreaInputSchema.safeParse({...kreaInput,...patch}).success).toBe(false);
});
it('discovers local inventory without claiming model or hardware compatibility', () => {
  const status=inspectKrea(kreaNodes());
  expect(status.diffusionModels).toContain(kreaInput.checkpoint);
  expect(kreaIssues(kreaInput,status)).toEqual([]);
  expect(kreaIssues({...kreaInput,checkpoint:'missing'},status).join()).toContain('missing');
});
it('checks required options and optional enhancer only when selected', () => {
  const nodes=kreaNodes(); delete nodes.TextGenerate;
  const status=inspectKrea(nodes);
  expect(kreaIssues(kreaInput,status)).toEqual([]);
  expect(kreaIssues({...kreaInput,enhancer:'engine'},status).join()).toContain('TextGenerate');
  nodes.CLIPLoader.input.required.type=[['sdxl']];
  expect(kreaIssues(kreaInput,inspectKrea(nodes)).join()).toContain('krea2');
  delete nodes.ModelSamplingFlux;
  expect(kreaIssues({...kreaInput,profile:'krea-raw',...kreaPresets['krea-raw']},inspectKrea(nodes)).join()).toContain('ModelSamplingFlux');
});
