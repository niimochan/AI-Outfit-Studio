import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type {
  AosAssetKind,
  AosMaterialOverride,
  AosProjectAsset,
  AosProjectManifest,
  AosTextureDocument,
  AosTextureLayer,
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

function normalizeMaterialOverrides(value: unknown): AosMaterialOverride[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const override = entry as Partial<AosMaterialOverride>;
    if (
      typeof override.materialKey !== 'string' ||
      typeof override.materialName !== 'string' ||
      (override.textureAssetId !== null && typeof override.textureAssetId !== 'string') ||
      typeof override.color !== 'string'
    ) {
      return [];
    }

    const finite = (number: unknown, fallback: number): number =>
      typeof number === 'number' && Number.isFinite(number) ? number : fallback;

    return [{
      materialKey: override.materialKey,
      materialName: override.materialName,
      textureAssetId: override.textureAssetId ?? null,
      color: /^#[0-9a-f]{6}$/i.test(override.color) ? override.color : '#ffffff',
      opacity: Math.min(1, Math.max(0, finite(override.opacity, 1))),
      repeatX: Math.max(0.01, finite(override.repeatX, 1)),
      repeatY: Math.max(0.01, finite(override.repeatY, 1)),
      offsetX: finite(override.offsetX, 0),
      offsetY: finite(override.offsetY, 0),
    }];
  });
}


function normalizeTextureDocuments(value: unknown): AosTextureDocument[] {
  if (!Array.isArray(value)) return [];
  const finite = (input: unknown, fallback: number): number =>
    typeof input === 'number' && Number.isFinite(input) ? input : fallback;
  const blendModes = new Set(['source-over', 'multiply', 'screen', 'overlay']);

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const document = entry as Partial<AosTextureDocument>;
    if (
      typeof document.id !== 'string' ||
      typeof document.name !== 'string' ||
      typeof document.templateAssetId !== 'string' ||
      !Array.isArray(document.layers)
    ) return [];

    const layers: AosTextureLayer[] = document.layers.flatMap((layerEntry) => {
      if (!layerEntry || typeof layerEntry !== 'object') return [];
      const layer = layerEntry as Partial<AosTextureLayer>;
      if (typeof layer.id !== 'string' || typeof layer.name !== 'string' || typeof layer.sourceAssetId !== 'string') return [];
      return [{
        id: layer.id,
        name: layer.name,
        sourceAssetId: layer.sourceAssetId,
        visible: layer.visible !== false,
        opacity: Math.min(1, Math.max(0, finite(layer.opacity, 1))),
        blendMode: (blendModes.has(layer.blendMode ?? '') ? layer.blendMode : 'source-over') as AosTextureLayer['blendMode'],
        x: finite(layer.x, 0),
        y: finite(layer.y, 0),
        scaleX: Math.max(0.01, finite(layer.scaleX, 1)),
        scaleY: Math.max(0.01, finite(layer.scaleY, 1)),
        rotation: finite(layer.rotation, 0),
        eraserStrokes: Array.isArray(layer.eraserStrokes) ? layer.eraserStrokes.flatMap((strokeEntry) => {
          if (!strokeEntry || typeof strokeEntry !== 'object') return [];
          const stroke = strokeEntry as { id?: unknown; x?: unknown; y?: unknown; radius?: unknown };
          return [{
            id: typeof stroke.id === 'string' ? stroke.id : crypto.randomUUID(),
            x: finite(stroke.x, 0),
            y: finite(stroke.y, 0),
            radius: Math.min(4096, Math.max(1, finite(stroke.radius, 32))),
          }];
        }) : [],
      }];
    });

    return [{
      id: document.id,
      name: document.name,
      templateAssetId: document.templateAssetId,
      width: Math.min(16384, Math.max(1, Math.round(finite(document.width, 2048)))),
      height: Math.min(16384, Math.max(1, Math.round(finite(document.height, 2048)))),
      maskToTemplateAlpha: document.maskToTemplateAlpha !== false,
      showTemplateBase: document.showTemplateBase !== false,
      layers,
      createdAt: typeof document.createdAt === 'string' ? document.createdAt : new Date().toISOString(),
      updatedAt: typeof document.updatedAt === 'string' ? document.updatedAt : new Date().toISOString(),
    }];
  });
}

function validateManifest(value: unknown): AosProjectManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('プロジェクトファイルの形式が正しくありません。');
  }

  const manifest = value as Partial<Omit<AosProjectManifest, 'schemaVersion' | 'materialOverrides' | 'textureDocuments'>> & {
    schemaVersion?: number;
    materialOverrides?: unknown;
    textureDocuments?: unknown;
  };
  if (
    (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2 && manifest.schemaVersion !== 3) ||
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

  return {
    ...(manifest as Omit<AosProjectManifest, 'schemaVersion' | 'materialOverrides' | 'textureDocuments'>),
    schemaVersion: 3,
    materialOverrides: normalizeMaterialOverrides(manifest.materialOverrides),
    textureDocuments: normalizeTextureDocuments(manifest.textureDocuments),
  };
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

  ipcMain.handle('texture:export-png', async (event, request: { defaultName: string; data: Uint8Array }) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const safeName = request.defaultName.replace(/[\\/:*?"<>|]/g, '_') || 'texture.png';
    const options: Electron.SaveDialogOptions = {
      title: 'VRoid用テクスチャPNGを書き出す',
      defaultPath: safeName.toLowerCase().endsWith('.png') ? safeName : `${safeName}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true } as const;
    const targetPath = result.filePath.toLowerCase().endsWith('.png') ? result.filePath : `${result.filePath}.png`;
    await writeFile(targetPath, Buffer.from(request.data));
    return { canceled: false, path: targetPath } as const;
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
