import { test, expect } from '@playwright/test';
import { simulatedComfy } from '../tests/fixtures/comfy.js';

test('image generation, download, history and exact setting reuse through the real API', async ({ page }) => {
  const fixture = await simulatedComfy();
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByLabel('ComfyUI 서버 주소').fill(fixture.url);
    await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    await expect(page.getByText('ComfyUI 연결됨', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '이미지 스튜디오', exact: true }).click();
    await page.getByLabel('프롬프트', { exact: true }).fill('a quiet forest');
    await page.getByText('상세 생성 설정', { exact: true }).click();
    await page.getByLabel('시드 (비우면 무작위)').fill('12345');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'test-results/m1-image-form.png', fullPage: true });
    await page.getByRole('button', { name: '이미지 생성', exact: true }).click();
    await expect(page.getByText('완료', { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('img', { name: '생성 결과' }).first()).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'PNG 다운로드' }).first().click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await page.getByRole('button', { name: '작업 기록 / 라이브러리', exact: true }).click();
    await expect(page.getByText('a quiet forest', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '설정 재사용' }).first().click();
    await expect(page.getByLabel('프롬프트', { exact: true })).toHaveValue('a quiet forest');
    await page.getByText('상세 생성 설정', { exact: true }).click();
    await expect(page.getByLabel('시드 (비우면 무작위)')).toHaveValue('12345');
    await page.reload();
    await page.getByRole('button', { name: '작업 기록 / 라이브러리', exact: true }).click();
    await expect(page.getByRole('img', { name: '생성 결과' }).first()).toBeVisible();
    await page.screenshot({ path: 'test-results/m1-library.png', fullPage: true });
  } finally { await fixture.close(); }
});
