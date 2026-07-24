import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';

const isDevelopment = Boolean(process.env.AOS_DEV_SERVER_URL);

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0f14',
    title: 'AI Outfit Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDevelopment && process.env.AOS_DEV_SERVER_URL) {
    void window.loadURL(process.env.AOS_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return window;
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => app.getVersion());
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
