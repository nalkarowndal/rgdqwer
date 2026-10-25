import {test,expect} from '@playwright/test';
import {simulatedComfy} from '../tests/fixtures/comfy.js';import {imageNodes} from '../tests/fixtures/image.js';
async function connect(page:import('@playwright/test').Page,url:string){await page.goto('/');await page.getByRole('button',{name:'설정',exact:true}).click();await page.getByLabel('ComfyUI 서버 주소').fill(url);await page.getByRole('button',{name:'설정 저장',exact:true}).click();await expect(page.getByText('ComfyUI 연결됨',{exact:true})).toBeVisible();await page.getByRole('button',{name:'이미지 스튜디오',exact:true}).click();}
test('image LoRA clicks retain settings, skip off files and restore saved adapters',async({page})=>{
 const fixture=await simulatedComfy({extraNodes:imageNodes()});
 try{
  await connect(page,fixture.url);await page.getByRole('button',{name:'LoRA 추가',exact:true}).click();
  await page.getByLabel('LoRA 1 파일', {exact:true}).selectOption('style.safetensors');await page.getByLabel('LoRA 1 강도',{exact:true}).fill('0.65');
  const toggle=page.getByRole('switch',{name:'LoRA 1 활성화'});await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();await expect(page.getByLabel('LoRA 1 파일',{exact:true})).toHaveValue('style.safetensors');await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toBeChecked();await expect(page.getByLabel('LoRA 1 강도',{exact:true})).toHaveValue('0.65');
  await page.getByRole('button',{name:'LoRA 추가',exact:true}).click();await page.getByLabel('LoRA 2 파일',{exact:true}).selectOption('detail.safetensors');await page.getByRole('switch',{name:'LoRA 2 활성화'}).uncheck();
  await page.getByRole('button',{name:'전문가',exact:true}).click();await page.getByLabel('프롬프트',{exact:true}).fill('a forest');
  await page.getByRole('button',{name:'이미지 생성',exact:true}).click();await expect(page.getByText('완료',{exact:true}).first()).toBeVisible({timeout:15000});
  const graph=fixture.calls.find(c=>c.path==='/prompt')!.body.prompt as Record<string,{class_type:string;inputs:Record<string,unknown>}>;
  expect(Object.values(graph).filter(n=>n.class_type==='LoraLoader').map(n=>n.inputs.lora_name)).toEqual(['style.safetensors']);
  await page.reload();await page.getByRole('button',{name:'작업 기록 / 라이브러리',exact:true}).click();await page.getByRole('button',{name:'설정 재사용'}).first().click();
  await expect(page.getByRole('switch',{name:'LoRA 1 활성화'})).toBeChecked();await expect(page.getByRole('switch',{name:'LoRA 2 활성화'})).not.toBeChecked();await expect(page.getByLabel('LoRA 1 강도',{exact:true})).toHaveValue('0.65');
  await page.getByLabel('모델 프로필',{exact:true}).selectOption('anima');await expect(page.getByRole('switch',{name:'LoRA 1 활성화'})).not.toBeChecked();await expect(page.getByRole('switch',{name:'LoRA 1 활성화'})).toBeDisabled();
  await page.getByLabel('모델 프로필',{exact:true}).selectOption('sd15');await expect(page.getByLabel('LoRA 1 파일',{exact:true})).toHaveValue('style.safetensors');await expect(page.getByRole('switch',{name:'LoRA 1 활성화'})).not.toBeChecked();
 }finally{await fixture.close();}
});
test('Anima fields, download card and mobile model-only LoRA through real API',async({page})=>{
 const fixture=await simulatedComfy({extraNodes:imageNodes()});
 try{
  await connect(page,fixture.url);await page.getByLabel('모델 프로필',{exact:true}).selectOption('anima');
  await expect(page.getByLabel('Anima 확산 모델',{exact:true})).toHaveValue('anima-base-v1.0.safetensors');await expect(page.getByLabel('Anima 텍스트 인코더',{exact:true})).toHaveValue('qwen_3_06b_base.safetensors');
  await page.getByRole('button',{name:'LoRA 추가',exact:true}).click();await page.getByLabel('LoRA 1 파일',{exact:true}).selectOption('anima-style.safetensors');await page.getByRole('button',{name:'전문가',exact:true}).click();await page.getByLabel('프롬프트',{exact:true}).fill('a painted forest');
  await page.getByText('상세 생성 설정',{exact:true}).click();await page.getByLabel('가로 (px)').fill('512');await page.getByLabel('세로 (px)').fill('512');
  await page.screenshot({path:'test-results/image-anima-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/image-anima-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'이미지 생성',exact:true}).click();await expect(page.getByText('완료',{exact:true}).first()).toBeVisible({timeout:15000});
  const graph=fixture.calls.find(c=>c.path==='/prompt')!.body.prompt as Record<string,{class_type:string;inputs:Record<string,unknown>}>;expect(graph['11'].inputs.type).toBe('stable_diffusion');expect(graph['3'].inputs.sampler_name).toBe('er_sde');expect(Object.values(graph).some(n=>n.class_type==='LoraLoaderModelOnly')).toBe(true);
  await page.getByRole('button',{name:'모델·확장 관리자',exact:true}).click();await expect(page.getByText('이미지 생성 · Anima',{exact:true})).toBeVisible();
 }finally{await fixture.close();}
});
test('sending a different prompt profile disables incompatible LoRA and refreshes new model files',async({page})=>{
 const fixture=await simulatedComfy({extraNodes:imageNodes()});
 try{
  await connect(page,fixture.url);await page.getByRole('button',{name:'LoRA 추가',exact:true}).click();
  await page.getByRole('button',{name:'프롬프트 스튜디오',exact:true}).click();await page.getByLabel('대상 모델 프로필').selectOption('anima');await page.getByRole('button',{name:'전문가',exact:true}).click();await page.getByLabel('프롬프트',{exact:true}).fill('a painted forest');await page.getByRole('button',{name:'이미지 스튜디오로 보내기',exact:true}).click();
  await expect(page.getByRole('switch',{name:'LoRA 1 활성화'})).not.toBeChecked();await expect(page.getByLabel('Anima 확산 모델',{exact:true})).toHaveValue('anima-base-v1.0.safetensors');
  await page.getByLabel('모델 프로필',{exact:true}).selectOption('sd15');
  fixture.nodes.CheckpointLoaderSimple={input:{required:{ckpt_name:[['new.safetensors']]}}};await page.getByRole('button',{name:'모델·LoRA 목록 새로고침',exact:true}).click();
  await expect(page.getByLabel('체크포인트',{exact:true}).getByRole('option',{name:'new.safetensors',exact:true})).toBeAttached();
 }finally{await fixture.close();}
});
