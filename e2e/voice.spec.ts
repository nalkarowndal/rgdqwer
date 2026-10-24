import { test,expect } from '@playwright/test';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../server/video/process.js';
test.use({launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
test('registers authorized voice, previews audio and honestly reports missing engines',async({page})=>{
 const directory=await mkdtemp(join(tmpdir(),'voice-e2e-'));const file=join(directory,'my-voice.wav');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=3','-ar','24000',file]);
  await page.goto('/');await page.getByRole('button',{name:'AI 음성 스튜디오',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI 음성 스튜디오',exact:true})).toBeVisible();
  await page.getByLabel('참고 음성 파일').setInputFiles(file);await expect(page.getByText('참고 음성 저장 완료')).toBeVisible();
  await page.getByLabel('프로필 이름').fill('내 목소리 E2E');await page.getByLabel('사용 허가 정보').fill('본인이 녹음한 목소리입니다.');
  await expect(page.getByRole('button',{name:'음성 프로필 저장',exact:true})).toBeDisabled();
  await page.getByLabel('이 음성의 복제·변환·저장에 필요한 권한이 있습니다.').check();await page.getByRole('button',{name:'음성 프로필 저장',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'음성 프로필',exact:true})).not.toHaveValue('');
  await page.getByLabel('읽을 대사').fill('안녕하세요. 로컬 음성 스튜디오입니다.');
  await expect(page.getByRole('button',{name:'음성 생성 / 변환',exact:true})).toBeDisabled();
  await expect(page.getByText('실제 모델 추론과 8GB GPU 안정성은 검증 전입니다.')).toBeVisible();
  await page.getByRole('combobox',{name:'음성 엔진',exact:true}).selectOption('chatterbox-vc');await page.getByLabel('변환할 음성 파일').setInputFiles(file);
  const audio=page.getByLabel('변환 전 음성');await expect(audio).toBeVisible();await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.readyState)).toBeGreaterThanOrEqual(2);await audio.evaluate((a:HTMLAudioElement)=>a.play());await expect.poll(()=>audio.evaluate((a:HTMLAudioElement)=>a.currentTime)).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/m6-voice.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/m6-voice-mobile.png',fullPage:true});expect(errors).toEqual([]);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('voice result players, comparison and exact reuse with explicitly simulated engine responses',async({page})=>{
 const dir=await mkdtemp(join(tmpdir(),'voice-playback-'));const file=join(dir,'fixture.wav');
 try{
  await runProcess('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=1','-ar','24000',file]);
  const {readFile}=await import('node:fs/promises');const bytes=await readFile(file);
  const profile={id:'11111111-1111-4111-8111-111111111111',name:'SIMULATED voice',referenceId:'22222222-2222-4222-8222-222222222222',languages:['ko'],engines:['chatterbox-tts'],permission:'TEST ONLY',authorized:true,consentedAt:new Date().toISOString(),defaults:{exaggeration:0.5,cfg:0.5,temperature:0.8,pitch:0}};
  const input={profile:'voice',engine:'chatterbox-tts',voiceProfileId:profile.id,prompt:'시뮬레이션 결과 재생 테스트',language:'ko',seed:17,authorized:true,...profile.defaults};
  const jobs=[0,1].map(i=>({id:`job-${i}`,kind:'audio',state:'completed',input:{...input,seed:17+i},voiceProfile:profile,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),workflowVersion:'voice-v1',engineUrl:'',promptId:null,progress:100,error:null,log:[],cancelRequested:false,artifacts:[{id:`artifact-${i}`,fileName:`fixture-${i}.wav`,mediaType:'audio/wav',duration:1}]}));
  await page.route('**/api/library?*',route=>route.fulfill({json:{items:jobs.map(job=>({job,title:'',favorite:false})),total:jobs.length,offset:0,limit:20}}));
  await page.route('**/api/jobs',route=>route.fulfill({json:jobs}));await page.route('**/api/voice/profiles',route=>route.fulfill({json:[profile]}));
  await page.route('**/api/artifacts/*',route=>route.fulfill({contentType:'audio/wav',body:bytes}));
  await page.goto('/');await page.getByRole('button',{name:'AI 음성 스튜디오',exact:true}).click();
  const players=page.getByLabel('음성 결과 WAV');await expect(players).toHaveCount(2);await expect.poll(()=>players.first().evaluate((a:HTMLAudioElement)=>a.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole('button',{name:'설정 재사용',exact:true}).last().click();await expect(page.getByLabel('읽을 대사')).toHaveValue(input.prompt);await expect(page.getByLabel('음성 시드')).toHaveValue('18');
  await expect(page.getByRole('link',{name:'WAV 다운로드'})).toHaveCount(2);await page.getByRole('region',{name:'음성 결과 비교'}).getByRole('checkbox').first().check();await expect(players).toHaveCount(1);
  await page.getByRole('button',{name:'작업 기록 / 라이브러리',exact:true}).click();await expect(page.getByLabel('음성 결과 WAV')).toHaveCount(2);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test.describe('browser microphone capture using a synthetic Chromium device',()=>{
 test('records actual WebM, normalizes it through the API, and stops on navigation',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'AI 음성 스튜디오',exact:true}).click();await page.getByRole('combobox',{name:'음성 엔진',exact:true}).selectOption('chatterbox-vc');
  await page.getByRole('button',{name:'마이크 녹음 시작',exact:true}).click();await expect(page.getByRole('button',{name:'녹음 중지',exact:true})).toBeVisible();
  // A deliberate capture interval, not a readiness sleep: produce >=0.1s of real media.
  await page.waitForTimeout(1200);await page.getByRole('button',{name:'녹음 중지',exact:true}).click();
  await expect(page.getByLabel('변환 전 음성')).toBeVisible();await expect.poll(()=>page.getByLabel('변환 전 음성').evaluate((a:HTMLAudioElement)=>a.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole('button',{name:'마이크 녹음 시작',exact:true}).click();await expect(page.getByRole('button',{name:'녹음 중지',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'홈 / 대시보드',exact:true}).click();await page.getByRole('button',{name:'AI 음성 스튜디오',exact:true}).click();await expect(page.getByRole('button',{name:'마이크 녹음 시작',exact:true})).toBeVisible();
 });
});
