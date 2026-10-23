import { test, expect } from '@playwright/test';
import { simulatedComfy } from '../tests/fixtures/comfy.js';
import { kreaNodes } from '../tests/fixtures/krea.js';
import { simulatedAnalysis } from '../tests/fixtures/analysis.js';
import { PNG } from 'pngjs';

test('Krea diagnostics, prompt editing, style, generation and reuse preserve settings',async({page})=>{
  const comfy=await simulatedComfy({extraNodes:kreaNodes(),width:1024,height:1024});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('/');await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByLabel('ComfyUI 서버 주소').fill(comfy.url);await page.getByRole('button',{name:'설정 저장',exact:true}).click();
    await expect(page.getByText('설정을 저장했습니다.',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Krea 2 스튜디오',exact:true}).click();
    await expect(page.getByLabel('Krea 확산 모델',{exact:true})).toHaveValue('krea2_turbo_fp8_scaled.safetensors');
    await page.getByLabel('Krea 프로필',{exact:true}).selectOption('krea-raw');
    await expect(page.getByText('52 스텝 · Comfy CFG 4.5',{exact:false})).toBeVisible();
    await page.getByLabel('Krea 프로필',{exact:true}).selectOption('krea-turbo');
    await page.getByLabel('장면 설명',{exact:true}).fill('고양이, 숲');
    await page.getByLabel('프롬프트 확장 방식',{exact:true}).selectOption('app');
    await expect(page.getByLabel('Krea 생성 프롬프트',{exact:true})).toHaveValue(/cat/);
    await page.getByLabel('Krea 생성 프롬프트',{exact:true}).fill('An orange cat under a tree.');
    await page.getByLabel('스타일 프리셋',{exact:true}).selectOption('krea2_darkbrush.safetensors');
    await page.getByLabel('Krea 시드',{exact:true}).fill('42');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:'test-results/m4-krea.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/m4-krea-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:720});
    await page.getByRole('button',{name:'Krea 이미지 생성',exact:true}).click();
    await expect(page.getByRole('img',{name:'생성 결과'}).first()).toBeVisible({timeout:15000});
    const prompt=comfy.calls.find(c=>c.path==='/prompt')?.body.prompt as Record<string,{inputs:Record<string,unknown>;class_type:string}>;
    expect(prompt['17'].inputs).toMatchObject({string_a:'An orange cat under a tree.',string_b:'monochrome ink wash style'});
    expect(Object.values(prompt).some(n=>n.class_type==='TextGenerate')).toBe(false);
    await page.getByRole('button',{name:'설정 재사용',exact:true}).click();
    await expect(page.getByLabel('Krea 생성 프롬프트',{exact:true})).toHaveValue('An orange cat under a tree.');
    await expect(page.getByLabel('Krea 시드',{exact:true})).toHaveValue('42');
    await expect(page.getByLabel('LoRA 파일',{exact:true})).toHaveValue('krea2_darkbrush.safetensors');
    expect(errors).toEqual([]);
  } finally{await comfy.close();}
});
test('edited image analysis transfers to Krea with enhancement off',async({page})=>{
  const worker=await simulatedAnalysis();const comfy=await simulatedComfy({extraNodes:kreaNodes(),width:1024,height:1024});
  try{
    await page.goto('/');await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByLabel('ComfyUI 서버 주소').fill(comfy.url);await page.getByLabel('Python Worker 서버 주소').fill(worker.url);
    await page.getByRole('button',{name:'설정 저장',exact:true}).click();await expect(page.getByText('설정을 저장했습니다.',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Image to Prompt',exact:true}).click();
    const png=new PNG({width:16,height:8});png.data.fill(255);
    await page.getByLabel('분석할 이미지').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:PNG.sync.write(png)});
    await page.getByRole('button',{name:'분석 상태 확인',exact:true}).click();
    await page.getByRole('button',{name:'이미지 분석',exact:true}).click();
    await expect(page.getByLabel('분석 전체 설명 / 캡션',{exact:true})).not.toHaveValue('');
    const final=await page.getByLabel('재구성 프롬프트',{exact:true}).inputValue();
    await page.getByRole('button',{name:'Krea 2 스튜디오에 적용',exact:true}).click();
    await expect(page.getByLabel('Krea 생성 프롬프트',{exact:true})).toHaveValue(final);
    await expect(page.getByLabel('프롬프트 확장 방식',{exact:true})).toHaveValue('none');
    expect(comfy.calls.some(c=>c.path==='/prompt')).toBe(false);
  } finally{await worker.close();await comfy.close();}
});
