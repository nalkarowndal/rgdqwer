import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4311', trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } },
  webServer: {
    command: 'node dist/server/index.js',
    env: { STUDIO_PORT: '4311', STUDIO_DATA_DIR: `.data/e2e-${randomUUID()}`, NODE_ENV: 'production' },
    url: 'http://127.0.0.1:4311', reuseExistingServer: false,
  },
});
