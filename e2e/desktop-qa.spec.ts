import {test,expect} from '@playwright/test';
test('all studio navigation works by keyboard at desktop and compact widths',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const pages=['이미지 스튜디오','영상 스튜디오','AI 음성 스튜디오','Krea 2 스튜디오','프롬프트 스튜디오','Image to Prompt','모델·확장 관리자','작업 기록 / 라이브러리','설정','홈 / 대시보드'];
 for(const width of [1440,760]){await page.setViewportSize({width,height:1000});for(const name of pages){const button=page.getByRole('navigation').getByRole('button',{name,exact:true});await button.focus();await expect(button).toBeFocused();await page.keyboard.press('Enter');await expect(button).toHaveAttribute('aria-current','page');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}}
 expect(errors).toEqual([]);await page.screenshot({path:'test-results/m8-keyboard-compact.png',fullPage:true});
});
