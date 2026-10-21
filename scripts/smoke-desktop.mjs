// Optional Linux cloud smoke. Flags are test-only; product keeps the Chromium sandbox enabled.
import { _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const data = await mkdtemp(join(tmpdir(), 'rgdqwer-desktop-'));
let instance;
try {
  instance = await electron.launch({
    args: ['.', `--user-data-dir=${data}`, ...(process.platform === 'linux' ? ['--no-sandbox', '--ozone-platform=headless'] : [])],
    timeout: 15000,
  });
  const page = await instance.firstWindow();
  await page.getByRole('heading', { name: '당신의 아이디어, 당신의 컴퓨터에서.' }).waitFor();
  const security = await instance.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration };
  });
  if (!security.sandbox || !security.contextIsolation || security.nodeIntegration) throw new Error('Unsafe window preferences');
  await page.screenshot({ path: 'test-results/electron-smoke.png' });
  console.log(JSON.stringify({ launched: true, security, testOnlyLinuxSandboxOverride: process.platform === 'linux' }));
} finally {
  await instance?.close();
  await rm(data, { recursive: true, force: true });
}
