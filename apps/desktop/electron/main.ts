import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type {
  AosAssetKind,
  AosProjectAsset,
  AosProjectManifest,
  AosRecentProject,
  HydratedProjectPayload,
  NativeFilePayload,
} from './ipc-types';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const isDevelopment = Boolean(process.env.AOS_DEV_SERVER_URL);
const dirtyWindows = new Map<number, boolean>();
const allowWindowClose = new Set<number>();

function mimeTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.vrm':
      return 'model/gltf-binary';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function readNativeFile(filePath: string): Promise<NativeFilePayload> {
  const data = await readFile(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    size: data.byteLength,
    mimeType: mimeTypeFor(filePath),
    data: new Uint8Array(data),
  };
}

function getRecentProjectsPath(): string {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

async function loadRecentProjects(): Promise<AosRecentProject[]> {
  try {
    const raw = await readFile(getRecentProjectsPath(), 'utf8');
    const parsed = JSON.parse(raw) as AosRecentProject[];
    return parsed.filter((entry) => typeof entry.path === 'string' && existsSync(entry.path)).slice(0, 8);
  } catch {
    return [];
  }
}

async function saveRecentProjects(entries: AosRecentProject[]): Promise<void> {
  const target = getRecentProjectsPath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(entries.slice(0, 8), null, 2)}\n`, 'utf8');
}

async function touchRecentProject(projectPath: string, manifest: AosProjectManifest): Promise<AosRecentProject[]> {
  const current = await loadRecentProjects();
  const next: AosRecentProject[] = [
    { path: projectPath, name: manifest.name, updatedAt: manifest.updatedAt },
    ...current.filter((entry) => path.resolve(entry.path) !== path.resolve(projectPath)),
  ].slice(0, 8);
  await saveRecentProjects(next);
  return next;
}

function validateManifest(value: unknown): AosProjectManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('プロジェクトファイルの形式が正しくありません。');
  }

  const manifest = value as Partial<AosProjectManifest>;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.id !== 'string' ||
    typeof manifest.name !== 'string' ||
    typeof manifest.createdAt !== 'string' ||
    typeof manifest.updatedAt !== 'string' ||
    !manifest.assets ||
    !Array.isArray(manifest.assets.references) ||
    !Array.isArray(manifest.assets.templates)
  ) {
    throw new Error('未対応または破損した .aos プロジェクトです。');
  }

  return manifest as AosProjectManifest;
}

async function hydrateAsset(asset: AosProjectAsset | null, missing: string[]): Promise<NativeFilePayload | null> {
  if (!asset) {
    return null;
  }
  if (!asset.sourcePath || !existsSync(asset.sourcePath)) {
    missing.push(asset.sourcePath || asset.name);
    return null;
  }
  return readNativeFile(asset.sourcePath);
}

async function hydrateAssets(assets: AosProjectAsset[], missing: string[]): Promise<NativeFilePayload[]> {
  const results = await Promise.all(assets.map((asset) => hydrateAsset(asset, missing)));
  return results.filter((asset): asset is NativeFilePayload => asset !== null);
}

async function openProjectFromPath(projectPath: string): Promise<HydratedProjectPayload> {
  const raw = await readFile(projectPath, 'utf8');
  const manifest = validateManifest(JSON.parse(raw));
  const missingAssetPaths: string[] = [];

  const [avatar, references, templates] = await Promise.all([
    hydrateAsset(manifest.assets.avatar, missingAssetPaths),
    hydrateAssets(manifest.assets.references, missingAssetPaths),
    hydrateAssets(manifest.assets.templates, missingAssetPaths),
  ]);

  await touchRecentProject(projectPath, manifest);

  return {
    path: projectPath,
    manifest,
    assets: { avatar, references, templates },
    missingAssetPaths,
  };
}

function sendCommand(window: BrowserWindow, command: string): void {
  window.webContents.send('app:command', command);
}

function installApplicationMenu(window: BrowserWindow): void {
  const menu = Menu.buildFromTemplate([
    {
      label: 'ファイル',
      submenu: [
        { label: '新規プロジェクト', accelerator: 'CmdOrCtrl+N', click: () => sendCommand(window, 'new-project') },
        { label: 'プロジェクトを開く', accelerator: 'CmdOrCtrl+O', click: () => sendCommand(window, 'open-project') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => sendCommand(window, 'save-project') },
        { label: '名前を付けて保存', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendCommand(window, 'save-project-as') },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'forceReload', label: '強制再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'ズームをリセット' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'togglefullscreen', label: '全画面表示' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
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

  dirtyWindows.set(window.id, false);
  installApplicationMenu(window);

  window.once('ready-to-show', () => {
    window.show();
  });

  window.on('close', (event) => {
    if (allowWindowClose.has(window.id) || !dirtyWindows.get(window.id)) {
      return;
    }

    event.preventDefault();
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: '未保存の変更',
      message: '保存されていない変更があります。',
      detail: '変更を破棄してAI Outfit Studioを終了しますか？',
      buttons: ['キャンセル', '変更を破棄して終了'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });

    if (choice === 1) {
      allowWindowClose.add(window.id);
      window.close();
    }
  });

  window.on('closed', () => {
    dirtyWindows.delete(window.id);
    allowWindowClose.delete(window.id);
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

  ipcMain.handle('app:set-document-state', (event, state: { dirty: boolean; title: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return;
    }
    dirtyWindows.set(window.id, Boolean(state.dirty));
    window.setTitle(state.title);
    window.setDocumentEdited(Boolean(state.dirty));
  });

  ipcMain.handle('dialog:confirm-discard', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '未保存の変更',
      message: '保存されていない変更を破棄しますか？',
      buttons: ['キャンセル', '変更を破棄'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return result.response === 1;
  });

  ipcMain.handle('asset:pick', async (event, kind: AosAssetKind) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const isAvatar = kind === 'avatar';
    const options: Electron.OpenDialogOptions = {
      title: isAvatar ? 'VRMアバターを選択' : kind === 'reference' ? '参考画像を選択' : 'VRoidテンプレートを選択',
      properties: isAvatar ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: isAvatar
        ? [{ name: 'VRM Avatar', extensions: ['vrm'] }]
        : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled) {
      return [];
    }
    return Promise.all(result.filePaths.map(readNativeFile));
  });

  ipcMain.handle('project:save', async (event, request: { path: string | null; saveAs: boolean; manifest: AosProjectManifest }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    let targetPath = request.path;

    if (!targetPath || request.saveAs) {
      const defaultName = `${request.manifest.name.replace(/[\\/:*?"<>|]/g, '_') || 'Untitled Project'}.aos`;
      const options: Electron.SaveDialogOptions = {
        title: 'AI Outfit Studioプロジェクトを保存',
        defaultPath: targetPath ?? defaultName,
        filters: [{ name: 'AI Outfit Studio Project', extensions: ['aos'] }],
      };
      const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) {
        return { canceled: true } as const;
      }
      targetPath = result.filePath.toLowerCase().endsWith('.aos') ? result.filePath : `${result.filePath}.aos`;
    }

    if (!targetPath) {
      return { canceled: true } as const;
    }

    const manifest: AosProjectManifest = {
      ...request.manifest,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const recentProjects = await touchRecentProject(targetPath, manifest);
    return { canceled: false, path: targetPath, manifest, recentProjects } as const;
  });

  ipcMain.handle('project:open', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'AI Outfit Studioプロジェクトを開く',
      properties: ['openFile'],
      filters: [{ name: 'AI Outfit Studio Project', extensions: ['aos'] }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return openProjectFromPath(result.filePaths[0]);
  });

  ipcMain.handle('project:open-path', async (_event, projectPath: string) => {
    return openProjectFromPath(projectPath);
  });

  ipcMain.handle('project:get-recent', async () => loadRecentProjects());

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
