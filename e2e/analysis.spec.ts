import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { simulatedAnalysis } from '../tests/fixtures/analysis.js';
import { simulatedComfy } from '../tests/fixtures/comfy.js';

test('upload, edit and lock survive reanalysis and page changes, then generate exact edited prompt', async ({page}) => {
  const worker = await simulatedAnalysis(); const comfy = await simulatedComfy();
  const errors: string[] = []; page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('/'); await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByLabel('Python Worker 서버 주소').fill(worker.url); await page.getByLabel('ComfyUI 서버 주소').fill(comfy.url);
    await page.getByRole('button',{name:'설정 저장',exact:true}).click();
    await expect(page.getByText('설정을 저장했습니다.',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Image to Prompt',exact:true}).click();
    const png = new PNG({width:16,height:8}); png.data.fill(255);
    await page.getByLabel('분석할 이미지').setInputFiles({name:'synthetic-fixture.png',mimeType:'image/png',buffer:PNG.sync.write(png)});
    await page.getByRole('button',{name:'분석 상태 확인',exact:true}).click();
    await page.getByLabel('분석 모델',{exact:true}).selectOption('both');
    await page.getByRole('button',{name:'이미지 분석',exact:true}).click();
    await expect(page.getByLabel('분석 외모',{exact:true})).toHaveValue('blue eyes');
    await page.getByLabel('분석 외모',{exact:true}).fill('brown eyes');
    await page.getByRole('checkbox',{name:'외모 잠금',exact:true}).check();
    worker.control.hold = true;
    await page.getByRole('button',{name:'이미지 분석',exact:true}).click();
    await expect.poll(()=>worker.calls.filter(c=>c.body).length).toBe(2);
    await page.getByLabel('분석 배경',{exact:true}).fill('ocean');
    await page.getByRole('button',{name:'홈 / 대시보드',exact:true}).click();
    worker.release();
    await page.getByRole('button',{name:'Image to Prompt',exact:true}).click();
    await expect(page.getByRole('button',{name:'이미지 분석',exact:true})).toBeEnabled();
    await expect(page.getByLabel('분석 외모',{exact:true})).toHaveValue('brown eyes');
    await expect(page.getByLabel('분석 배경',{exact:true})).toHaveValue('ocean');
    worker.control.hold = false; worker.control.status = 500;
    await page.getByRole('button',{name:'이미지 분석',exact:true}).click();
    await expect(page.getByText('분석에 실패했습니다.',{exact:false})).toBeVisible();
    await expect(page.getByLabel('분석 외모',{exact:true})).toHaveValue('brown eyes');
    await page.getByRole('button',{name:'분석 상태 확인',exact:true}).click();
    await page.getByRole('checkbox',{name:'전체 설명을 프롬프트에 포함',exact:true}).uncheck();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:'test-results/m3-analysis.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/m3-analysis-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:720});
    const final = await page.getByLabel('재구성 프롬프트',{exact:true}).inputValue();
    expect(final).toContain('brown eyes'); expect(final).toContain('ocean'); expect(final).not.toContain('HELLO'); expect(final).not.toContain('forest');
    await page.getByRole('button',{name:'이미지 스튜디오에 적용',exact:true}).click();
    await expect(page.getByLabel('프롬프트',{exact:true})).toHaveValue(final);
    await page.getByRole('button',{name:'이미지 생성',exact:true}).click();
    await expect.poll(()=>comfy.calls.some(c=>c.path==='/prompt')).toBe(true);
    expect(comfy.calls.find(c=>c.path==='/prompt')?.body).toMatchObject({prompt:{'6':{inputs:{text:final}}}});
    await expect(page.getByRole('img',{name:'생성 결과'}).first()).toBeVisible({timeout:15000});
    expect(errors).toEqual([]);
  } finally { await worker.close(); await comfy.close(); }
});

test('missing models show setup without claiming inference is ready', async ({page}) => {
  const worker = await simulatedAnalysis(); worker.control.missing = true;
  try {
    await page.goto('/'); await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByLabel('Python Worker 서버 주소').fill(worker.url); await page.getByRole('button',{name:'설정 저장',exact:true}).click();
    await expect(page.getByText('설정을 저장했습니다.',{exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Image to Prompt',exact:true}).click();
    await page.getByRole('button',{name:'분석 상태 확인',exact:true}).click();
    await expect(page.getByText('Florence-2 · 준비 필요', {exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'이미지 분석',exact:true})).toBeDisabled();
    await expect(page.getByText('worker.token', {exact:false}).first()).toBeVisible();
  } finally { await worker.close(); }
});
