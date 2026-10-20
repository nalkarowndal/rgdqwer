import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';

const uiDir = resolve('dist/ui');
const port = Number(process.env.STUDIO_PORT ?? '4310');
const app = await createApp({
  dataDir: resolve(process.env.STUDIO_DATA_DIR ?? '.data'),
  uiDir: existsSync(uiDir) ? uiDir : undefined,
  devOrigin: process.env.NODE_ENV === 'production' ? undefined : 'http://127.0.0.1:5173',
});
try {
  const address = await app.listen({ host: '127.0.0.1', port });
  console.log(`rgdqwer: ${address}`);
} catch (error) {
  await app.close();
  console.error(error instanceof Error ? error.message : '서버 시작 실패');
  process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
