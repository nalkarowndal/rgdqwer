import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';

test('honest dashboard, saved settings, unavailable features and responsive layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '당신의 아이디어, 당신의 컴퓨터에서.' })).toBeVisible();
  await expect(page.getByText('ComfyUI에 연결하지 못했습니다.', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByLabel('ComfyUI 서버 주소')).toBeVisible();
  await page.getByLabel('ComfyUI 서버 주소').fill('http://192.168.1.10:8188');
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('127.0.0.1');
  await page.getByLabel('ComfyUI 서버 주소').fill('http://127.0.0.1:18288');
  await page.getByRole('button', { name: '설정 저장', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '설정을 저장했습니다' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByLabel('ComfyUI 서버 주소')).toHaveValue('http://127.0.0.1:18288');
  await page.getByRole('button', { name: '이미지 스튜디오', exact: true }).click();
  await expect(page.getByRole('button', { name: '이미지 생성 · M1 예정' })).toBeDisabled();
  await page.getByRole('button', { name: 'Krea 2 스튜디오', exact: true }).click();
  await expect(page.getByText('8GB 실행 가능 여부는 실기 검증 전입니다.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '홈 / 대시보드', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/dashboard-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('displays actual adapter responses from an explicitly simulated local engine', async ({ page }) => {
  let cpuMode = false;
  const fixture = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/system_stats' ? {
      system: { os: 'nt', python_version: '3.12', ram_total: 17179869184, comfyui_version: 'simulated' },
      devices: [{ name: cpuMode ? 'cpu' : 'SIMULATED GPU', type: cpuMode ? 'cpu' : 'cuda', vram_total: 8589934592, vram_free: 4294967296 }],
    } : { CheckpointLoaderSimple: { input: { required: { ckpt_name: [['SIMULATED.safetensors'], {}] } } } }));
  });
  await new Promise<void>((resolve, reject) => { fixture.once('error', reject); fixture.listen(0, '127.0.0.1', resolve); });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByLabel('ComfyUI 서버 주소').fill(`http://127.0.0.1:${(fixture.address() as { port: number }).port}`);
    await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    await expect(page.getByText('ComfyUI 연결됨', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '홈 / 대시보드', exact: true }).click();
    await expect(page.getByText('SIMULATED GPU')).toBeVisible();
    await expect(page.getByText('8.0 GB', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '모델·확장 관리자', exact: true }).click();
    await expect(page.getByText('SIMULATED.safetensors')).toBeVisible();
    cpuMode = true;
    await page.getByRole('button', { name: '홈 / 대시보드', exact: true }).click();
    await page.getByRole('button', { name: '연결 상태 새로고침' }).click();
    await expect(page.getByText('CPU 모드 · GPU 메모리 측정 없음')).toBeVisible();
    await expect(page.getByText('8.0 GB', { exact: true })).toHaveCount(0);
  } finally {
    fixture.closeAllConnections();
    await new Promise<void>(resolve => fixture.close(() => resolve()));
  }
});
