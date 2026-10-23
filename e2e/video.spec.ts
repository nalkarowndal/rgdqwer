import { simulatedComfy } from '../tests/fixtures/comfy.js';
import { kreaNodes } from '../tests/fixtures/krea.js';
import { simulatedAnalysis } from '../tests/fixtures/analysis.js';
import { PNG } from 'pngjs';
import { test,expect } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../server/video/process.js';
test('actual video upload, conversion, playback, reuse and frame extraction',async({page})=>{
 const dir=await mkdtemp(join(tmpdir(),'video-e2e-'));const file=join(dir,'synthetic.mp4');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=96x64:rate=12:duration=1','-c:v','libx264','-pix_fmt','yuv420p',file]);
  await page.goto('/');await page.getByRole('button',{name:'영상 스튜디오',exact:true}).click();
  await page.getByLabel('영상 작업 모드').selectOption('convert');
  await page.getByLabel('원본 파일').setInputFiles(file);await expect(page.getByText('원본 저장 완료',{exact:false})).toBeVisible();
  await page.getByLabel('영상 가로').fill('128');await page.getByLabel('영상 세로').fill('96');await page.getByLabel('영상 프레임 수').fill('12');await page.getByLabel('영상 FPS').fill('12');
  await page.getByRole('button',{name:'영상 작업 시작',exact:true}).click();
  const video=page.getByLabel('영상 결과 플레이어');await expect(video).toBeVisible({timeout:20000});
  await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.readyState)).toBeGreaterThanOrEqual(2);
  await video.evaluate((v:HTMLVideoElement)=>v.play());await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(0);
  await expect(page.getByRole('link',{name:'MP4 다운로드'})).toHaveAttribute('download',/\.mp4$/);
  await page.screenshot({path:'test-results/m5-video.png',fullPage:true});
  await page.getByRole('button',{name:'설정 재사용',exact:true}).click();await expect(page.getByLabel('영상 가로')).toHaveValue('128');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/m5-video-mobile.png',fullPage:true});
  await page.getByLabel('영상 작업 모드').selectOption('extract');await page.getByLabel('영상 프레임 수').fill('3');await page.getByRole('button',{name:'영상 작업 시작',exact:true}).click();
  await expect(page.getByRole('img',{name:'생성 결과'})).toBeVisible({timeout:20000});await expect(page.getByLabel('결과 프레임')).toBeVisible();
  await page.getByLabel('결과 프레임').selectOption({index:2});expect(errors).toEqual([]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('edited image analysis transfers unchanged to video without generating',async({page})=>{
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
    await page.getByRole('button',{name:'영상 스튜디오에 적용',exact:true}).click();
    await expect(page.getByLabel('영상 생성 프롬프트',{exact:true})).toHaveValue(final);
    await expect(page.getByText('8GB 실행 안정성은 검증 전입니다.',{exact:false})).toBeVisible();
    expect(comfy.calls.some(c=>c.path==='/prompt')).toBe(false);
  } finally{await worker.close();await comfy.close();}
});
