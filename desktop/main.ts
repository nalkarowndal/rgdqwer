import { allowAudioPermission } from './permissions.js';
import { app, BrowserWindow, dialog, session } from 'electron';
import { resolve } from 'node:path';
import { createApp } from '../server/app.js';

let server: Awaited<ReturnType<typeof createApp>> | undefined;
let window: BrowserWindow | undefined;
let quitting = false;
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  void app.whenReady().then(async () => {
    server = await createApp({ dataDir: resolve(app.getPath('userData'), 'studio'), uiDir: resolve(app.getAppPath(), 'dist/ui') });
    const address = await server.listen({ host: '127.0.0.1', port: 0 });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(allowAudioPermission({permission,origin:details.requestingUrl,appOrigin:address,sameContents:!!window&&contents===window.webContents,mainFrame:details.isMainFrame,mediaTypes:'mediaTypes' in details ? details.mediaTypes??[]:[]})));
    session.defaultSession.setPermissionCheckHandler((contents,permission,origin,details)=>allowAudioPermission({permission,origin,appOrigin:address,sameContents:!!window&&contents===window.webContents,mainFrame:details.isMainFrame,mediaTypes:details.mediaType?[details.mediaType]:[]}));
    window = new BrowserWindow({
      width: 1420, height: 1000, minWidth: 760, minHeight: 620,
      title: 'rgdqwer · 로컬 AI 스튜디오', backgroundColor: '#f6f7f8',
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== address) event.preventDefault();
    });
    await window.loadURL(address);
  }).catch(async error => {
    dialog.showErrorBox('rgdqwer 시작 실패', error instanceof Error ? error.message : String(error));
    await server?.close();
    app.exit(1);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting || !server) return;
    event.preventDefault();
    quitting = true;
    void server.close().finally(() => app.quit());
  });
}
