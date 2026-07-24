import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AosAssetKind,
  AosProjectManifest,
  AosRecentProject,
  HydratedProjectPayload,
  NativeFilePayload,
} from '@ai-outfit-studio/common';
import {
  APP_NAME,
  APP_VERSION,
  createProjectManifest,
} from '@ai-outfit-studio/common';
import type { VrmLoadResult, VrmStageStats } from '@ai-outfit-studio/vrm-engine';
import { VrmViewport } from './components/VrmViewport';
import {
  disposeRuntimeAsset,
  disposeRuntimeAssets,
  runtimeAssetFromFile,
  runtimeAssetFromPayload,
  type RuntimeAsset,
} from './project-runtime';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type CameraCommand = 'fit' | 'reset' | null;
type SelectedItem =
  | { kind: 'project' }
  | { kind: 'avatar'; id: string }
  | { kind: 'reference' | 'template'; id: string };
type Notice = { tone: 'info' | 'warning' | 'error'; message: string } | null;

const initialStats: VrmStageStats = {
  fps: 0,
  triangles: 0,
  drawCalls: 0,
  geometries: 0,
  textures: 0,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function filePathName(filePath: string | null): string {
  if (!filePath) return '未保存';
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function App() {
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const runtimeAssetsRef = useRef<{ avatar: RuntimeAsset | null; references: RuntimeAsset[]; templates: RuntimeAsset[] }>({ avatar: null, references: [], templates: [] });

  const [project, setProject] = useState<AosProjectManifest>(() => createProjectManifest());
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [recentProjects, setRecentProjects] = useState<AosRecentProject[]>([]);
  const [avatar, setAvatar] = useState<RuntimeAsset | null>(null);
  const [references, setReferences] = useState<RuntimeAsset[]>([]);
  const [templates, setTemplates] = useState<RuntimeAsset[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ kind: 'project' });

  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadResult, setLoadResult] = useState<VrmLoadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [stats, setStats] = useState<VrmStageStats>(initialStats);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>(null);
  const [cameraCommandId, setCameraCommandId] = useState(0);
  const [electronVersion, setElectronVersion] = useState<string>('web-preview');

  const issueCameraCommand = useCallback((command: Exclude<CameraCommand, null>) => {
    setCameraCommand(command);
    setCameraCommandId((value) => value + 1);
  }, []);

  const showNotice = useCallback((nextNotice: Exclude<Notice, null>) => {
    setNotice(nextNotice);
    window.setTimeout(() => {
      setNotice((current) => current?.message === nextNotice.message ? null : current);
    }, 5200);
  }, []);

  const sourcePathForFile = useCallback((file: File): string => {
    try {
      return window.aosDesktop?.getPathForFile(file) ?? '';
    } catch {
      return '';
    }
  }, []);

  const addFiles = useCallback((kind: AosAssetKind, files: File[]) => {
    const accepted = files.filter((file) =>
      kind === 'avatar'
        ? file.name.toLowerCase().endsWith('.vrm')
        : /\.(png|jpe?g|webp)$/i.test(file.name),
    );

    if (accepted.length === 0) {
      showNotice({
        tone: 'error',
        message: kind === 'avatar' ? '拡張子 .vrm のファイルを選択してください。' : 'PNG・JPEG・WebP画像を選択してください。',
      });
      return;
    }

    if (kind === 'avatar') {
      const next = runtimeAssetFromFile(accepted[0]!, 'avatar', sourcePathForFile(accepted[0]!));
      disposeRuntimeAsset(avatar);
      setAvatar(next);
      setSelectedItem({ kind: 'avatar', id: next.meta.id });
      setLoadResult(null);
      setErrorMessage(null);
      setIsDirty(true);
      return;
    }

    const currentAssets = kind === 'reference' ? references : templates;
    const existingKeys = new Set(currentAssets.map((asset) => asset.meta.sourcePath || `${asset.meta.name}:${asset.meta.size}`));
    const unique = accepted
      .map((file) => runtimeAssetFromFile(file, kind, sourcePathForFile(file)))
      .filter((asset) => {
        const key = asset.meta.sourcePath || `${asset.meta.name}:${asset.meta.size}`;
        if (existingKeys.has(key)) {
          disposeRuntimeAsset(asset);
          return false;
        }
        existingKeys.add(key);
        return true;
      });

    if (unique.length === 0) {
      showNotice({ tone: 'info', message: '選択したアセットはすでに追加されています。' });
      return;
    }

    if (kind === 'reference') setReferences((current) => [...current, ...unique]);
    else setTemplates((current) => [...current, ...unique]);
    setSelectedItem({ kind, id: unique[0]!.meta.id });
    setIsDirty(true);
  }, [avatar, references, showNotice, sourcePathForFile, templates]);

  const addNativeAssets = useCallback(async (kind: AosAssetKind) => {
    if (!window.aosDesktop) {
      if (kind === 'avatar') avatarInputRef.current?.click();
      if (kind === 'reference') referenceInputRef.current?.click();
      if (kind === 'template') templateInputRef.current?.click();
      return;
    }

    try {
      const payloads = await window.aosDesktop.pickAssets(kind);
      if (payloads.length === 0) return;
      const runtime = payloads.map((payload) => runtimeAssetFromPayload(payload, kind));

      if (kind === 'avatar') {
        const next = runtime[0]!;
        disposeRuntimeAsset(avatar);
        setAvatar(next);
        setSelectedItem({ kind: 'avatar', id: next.meta.id });
        setLoadResult(null);
        setErrorMessage(null);
        setIsDirty(true);
        return;
      }

      const currentAssets = kind === 'reference' ? references : templates;
      const existingPaths = new Set(currentAssets.map((asset) => asset.meta.sourcePath));
      const unique = runtime.filter((asset) => {
        if (existingPaths.has(asset.meta.sourcePath)) {
          disposeRuntimeAsset(asset);
          return false;
        }
        existingPaths.add(asset.meta.sourcePath);
        return true;
      });
      if (unique.length === 0) {
        showNotice({ tone: 'info', message: '選択したアセットはすでに追加されています。' });
        return;
      }
      if (kind === 'reference') setReferences((current) => [...current, ...unique]);
      else setTemplates((current) => [...current, ...unique]);
      setSelectedItem({ kind, id: unique[0]!.meta.id });
      setIsDirty(true);
    } catch (error) {
      showNotice({ tone: 'error', message: error instanceof Error ? error.message : 'ファイル選択に失敗しました。' });
    }
  }, [avatar, references, showNotice, templates]);

  const buildManifest = useCallback((): AosProjectManifest => ({
    ...project,
    appVersion: APP_VERSION,
    assets: {
      avatar: avatar?.meta ?? null,
      references: references.map((asset) => asset.meta),
      templates: templates.map((asset) => asset.meta),
    },
  }), [avatar, project, references, templates]);

  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!isDirty) return true;
    if (window.aosDesktop) {
      return window.aosDesktop.confirmDiscardChanges();
    }
    return window.confirm('保存されていない変更を破棄しますか？');
  }, [isDirty]);

  const clearRuntimeProject = useCallback(() => {
    disposeRuntimeAsset(avatar);
    disposeRuntimeAssets(references);
    disposeRuntimeAssets(templates);
    setAvatar(null);
    setReferences([]);
    setTemplates([]);
    setLoadState('idle');
    setProgress(null);
    setLoadResult(null);
    setErrorMessage(null);
    setStats(initialStats);
    setSelectedItem({ kind: 'project' });
  }, [avatar, references, templates]);

  const newProject = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    clearRuntimeProject();
    setProject(createProjectManifest());
    setProjectPath(null);
    setIsDirty(false);
    showNotice({ tone: 'info', message: '新しいプロジェクトを作成しました。' });
  }, [clearRuntimeProject, confirmDiscard, showNotice]);

  const applyHydratedProject = useCallback((payload: HydratedProjectPayload) => {
    clearRuntimeProject();
    const avatarMeta = payload.manifest.assets.avatar;
    const nextAvatar = payload.assets.avatar
      ? runtimeAssetFromPayload(payload.assets.avatar, 'avatar', avatarMeta ?? undefined)
      : null;
    const remainingReferenceMeta = [...payload.manifest.assets.references];
    const nextReferences = payload.assets.references.map((file) => {
      const index = remainingReferenceMeta.findIndex((asset) => asset.sourcePath === file.path);
      const meta = index >= 0 ? remainingReferenceMeta.splice(index, 1)[0] : undefined;
      return runtimeAssetFromPayload(file, 'reference', meta);
    });
    const remainingTemplateMeta = [...payload.manifest.assets.templates];
    const nextTemplates = payload.assets.templates.map((file) => {
      const index = remainingTemplateMeta.findIndex((asset) => asset.sourcePath === file.path);
      const meta = index >= 0 ? remainingTemplateMeta.splice(index, 1)[0] : undefined;
      return runtimeAssetFromPayload(file, 'template', meta);
    });

    setProject(payload.manifest);
    setProjectPath(payload.path);
    setAvatar(nextAvatar);
    setReferences(nextReferences);
    setTemplates(nextTemplates);
    setSelectedItem(nextAvatar ? { kind: 'avatar', id: nextAvatar.meta.id } : { kind: 'project' });
    setIsDirty(false);

    if (payload.missingAssetPaths.length > 0) {
      showNotice({
        tone: 'warning',
        message: `${payload.missingAssetPaths.length}件のリンク先アセットが見つかりませんでした。`,
      });
    } else {
      showNotice({ tone: 'info', message: `「${payload.manifest.name}」を開きました。` });
    }
  }, [clearRuntimeProject, showNotice]);

  const openProject = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    if (!window.aosDesktop) {
      showNotice({ tone: 'error', message: '.aosプロジェクトを開くにはデスクトップ版が必要です。' });
      return;
    }
    try {
      const payload = await window.aosDesktop.openProject();
      if (payload) applyHydratedProject(payload);
      setRecentProjects(await window.aosDesktop.getRecentProjects());
    } catch (error) {
      showNotice({ tone: 'error', message: error instanceof Error ? error.message : 'プロジェクトを開けませんでした。' });
    }
  }, [applyHydratedProject, confirmDiscard, showNotice]);

  const openRecentProject = useCallback(async (recent: AosRecentProject) => {
    if (!(await confirmDiscard())) return;
    if (!window.aosDesktop) return;
    try {
      const payload = await window.aosDesktop.openProjectPath(recent.path);
      applyHydratedProject(payload);
      setRecentProjects(await window.aosDesktop.getRecentProjects());
    } catch (error) {
      showNotice({ tone: 'error', message: error instanceof Error ? error.message : '最近のプロジェクトを開けませんでした。' });
      setRecentProjects(await window.aosDesktop.getRecentProjects());
    }
  }, [applyHydratedProject, confirmDiscard, showNotice]);

  const saveProject = useCallback(async (saveAs = false) => {
    if (!window.aosDesktop) {
      showNotice({ tone: 'error', message: '.aos保存にはデスクトップ版が必要です。' });
      return;
    }

    const unlinkedAssets = [avatar, ...references, ...templates].filter((asset): asset is RuntimeAsset => Boolean(asset))
      .filter((asset) => !asset.meta.sourcePath);
    if (unlinkedAssets.length > 0) {
      showNotice({ tone: 'warning', message: '保存後に再読込できないアセットがあります。デスクトップの選択ボタンから追加し直してください。' });
    }

    try {
      const result = await window.aosDesktop.saveProject({
        path: projectPath,
        saveAs,
        manifest: buildManifest(),
      });
      if (result.canceled) return;
      setProject(result.manifest);
      setProjectPath(result.path);
      setRecentProjects(result.recentProjects);
      setIsDirty(false);
      showNotice({ tone: 'info', message: `保存しました：${filePathName(result.path)}` });
    } catch (error) {
      showNotice({ tone: 'error', message: error instanceof Error ? error.message : 'プロジェクトを保存できませんでした。' });
    }
  }, [avatar, buildManifest, projectPath, references, showNotice, templates]);

  const removeAsset = useCallback((kind: AosAssetKind, id: string) => {
    if (kind === 'avatar') {
      disposeRuntimeAsset(avatar);
      setAvatar(null);
      setLoadState('idle');
      setLoadResult(null);
      setErrorMessage(null);
      setStats(initialStats);
    } else if (kind === 'reference') {
      setReferences((current) => {
        const removed = current.find((asset) => asset.meta.id === id);
        disposeRuntimeAsset(removed);
        return current.filter((asset) => asset.meta.id !== id);
      });
    } else {
      setTemplates((current) => {
        const removed = current.find((asset) => asset.meta.id === id);
        disposeRuntimeAsset(removed);
        return current.filter((asset) => asset.meta.id !== id);
      });
    }
    setSelectedItem({ kind: 'project' });
    setIsDirty(true);
  }, [avatar]);

  const handleLoadStart = useCallback(() => {
    setLoadState('loading');
    setProgress(null);
    setErrorMessage(null);
  }, []);
  const handleProgress = useCallback((value: number | null) => setProgress(value), []);
  const handleLoaded = useCallback((result: VrmLoadResult) => {
    setLoadResult(result);
    setLoadState('ready');
    setProgress(1);
  }, []);
  const handleError = useCallback((message: string) => {
    setLoadState('error');
    setErrorMessage(message);
    setProgress(null);
  }, []);
  const handleStats = useCallback((nextStats: VrmStageStats) => setStats(nextStats), []);

  useEffect(() => {
    void window.aosDesktop?.getAppVersion().then(setElectronVersion);
    void window.aosDesktop?.getRecentProjects().then(setRecentProjects);
  }, []);

  useEffect(() => {
    const title = `${isDirty ? '● ' : ''}${project.name} — ${APP_NAME}`;
    void window.aosDesktop?.setDocumentState({ dirty: isDirty, title });
  }, [isDirty, project.name]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const handleDropEvent = (event: Event) => {
      const files = (event as CustomEvent<File[]>).detail;
      const vrm = files.find((file) => file.name.toLowerCase().endsWith('.vrm'));
      const images = files.filter((file) => /\.(png|jpe?g|webp)$/i.test(file.name));
      if (vrm) addFiles('avatar', [vrm]);
      if (images.length > 0) {
        addFiles('reference', images);
        showNotice({ tone: 'info', message: `${images.length}件を参考画像として追加しました。` });
      }
    };
    shell.addEventListener('aos-files-drop', handleDropEvent);
    return () => shell.removeEventListener('aos-files-drop', handleDropEvent);
  }, [addFiles, showNotice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (event.key.toLowerCase() === 'f') issueCameraCommand('fit');
      if (event.key.toLowerCase() === 'r') issueCameraCommand('reset');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [issueCameraCommand]);

  useEffect(() => window.aosDesktop?.onAppCommand((command) => {
    if (command === 'new-project') void newProject();
    if (command === 'open-project') void openProject();
    if (command === 'save-project') void saveProject(false);
    if (command === 'save-project-as') void saveProject(true);
  }), [newProject, openProject, saveProject]);

  useEffect(() => {
    runtimeAssetsRef.current = { avatar, references, templates };
  }, [avatar, references, templates]);

  useEffect(() => () => {
    disposeRuntimeAsset(runtimeAssetsRef.current.avatar);
    disposeRuntimeAssets(runtimeAssetsRef.current.references);
    disposeRuntimeAssets(runtimeAssetsRef.current.templates);
  }, []);

  const statusLabel = useMemo(() => {
    switch (loadState) {
      case 'loading': return progress === null ? '読み込み中' : `読み込み中 ${Math.round(progress * 100)}%`;
      case 'ready': return 'VRM表示準備完了';
      case 'error': return 'VRMエラー';
      default: return isDirty ? '未保存の変更あり' : 'プロジェクト準備完了';
    }
  }, [isDirty, loadState, progress]);

  const selectedAsset = useMemo(() => {
    if (selectedItem.kind === 'avatar') return avatar;
    if (selectedItem.kind === 'reference') return references.find((asset) => asset.meta.id === selectedItem.id) ?? null;
    if (selectedItem.kind === 'template') return templates.find((asset) => asset.meta.id === selectedItem.id) ?? null;
    return null;
  }, [avatar, references, selectedItem, templates]);

  const activePreview = selectedAsset?.previewUrl ? selectedAsset : null;

  return (
    <div className="app-shell" ref={shellRef}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">AOS</div>
          <div>
            <h1>{APP_NAME}</h1>
            <p>VRM &amp; VRoid Clothing Authoring Suite</p>
          </div>
        </div>

        <div className="project-title-block">
          <input
            aria-label="プロジェクト名"
            value={project.name}
            onChange={(event) => {
              setProject((current) => ({ ...current, name: event.target.value }));
              setIsDirty(true);
            }}
          />
          <span title={projectPath ?? undefined}>{filePathName(projectPath)}{isDirty ? ' • 未保存' : ''}</span>
        </div>

        <div className="topbar-actions">
          <button type="button" onClick={() => void newProject()}>新規</button>
          <button type="button" onClick={() => void openProject()}>開く</button>
          <button className="save-button" type="button" onClick={() => void saveProject(false)}>保存</button>
        </div>

        <div className="topbar-status">
          <span className={`status-dot status-${loadState}`} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <aside className="sidebar left-sidebar">
        <section className="panel-section project-actions">
          <div className="section-heading"><span>PROJECT</span><small>Asset Foundation</small></div>
          <div className="button-grid">
            <button className="secondary-button" type="button" onClick={() => void newProject()}>新規 <kbd>Ctrl+N</kbd></button>
            <button className="secondary-button" type="button" onClick={() => void openProject()}>開く <kbd>Ctrl+O</kbd></button>
          </div>
          <button className="primary-button" type="button" onClick={() => void saveProject(false)}>プロジェクトを保存</button>
          <button className="text-button" type="button" onClick={() => void saveProject(true)}>名前を付けて保存</button>
        </section>

        <section className="panel-section asset-list">
          <div className="section-heading"><span>ASSETS</span><small>{(avatar ? 1 : 0) + references.length + templates.length}</small></div>

          <div className="asset-group-heading">
            <span>AVATAR</span>
            <button type="button" onClick={() => void addNativeAssets('avatar')}>＋</button>
          </div>
          {avatar ? (
            <button className={`asset-row ${selectedItem.kind === 'avatar' ? 'active' : ''}`} type="button" onClick={() => setSelectedItem({ kind: 'avatar', id: avatar.meta.id })}>
              <span className="asset-icon">3D</span>
              <span className="asset-copy"><strong>{avatar.meta.name}</strong><small>{formatBytes(avatar.meta.size)}</small></span>
            </button>
          ) : (
            <button className="empty-asset-row" type="button" onClick={() => void addNativeAssets('avatar')}>VRMを読み込む</button>
          )}

          <div className="asset-group-heading">
            <span>REFERENCE <b>{references.length}</b></span>
            <button type="button" onClick={() => void addNativeAssets('reference')}>＋</button>
          </div>
          {references.map((asset) => (
            <button className={`asset-row ${selectedItem.kind === 'reference' && selectedItem.id === asset.meta.id ? 'active' : ''}`} type="button" key={asset.meta.id} onClick={() => setSelectedItem({ kind: 'reference', id: asset.meta.id })}>
              {asset.previewUrl ? <img className="asset-thumb" src={asset.previewUrl} alt="" /> : <span className="asset-icon">IMG</span>}
              <span className="asset-copy"><strong>{asset.meta.name}</strong><small>{formatBytes(asset.meta.size)}</small></span>
            </button>
          ))}
          {references.length === 0 && <button className="empty-asset-row" type="button" onClick={() => void addNativeAssets('reference')}>参考画像を追加</button>}

          <div className="asset-group-heading">
            <span>TEMPLATES <b>{templates.length}</b></span>
            <button type="button" onClick={() => void addNativeAssets('template')}>＋</button>
          </div>
          {templates.map((asset) => (
            <button className={`asset-row ${selectedItem.kind === 'template' && selectedItem.id === asset.meta.id ? 'active' : ''}`} type="button" key={asset.meta.id} onClick={() => setSelectedItem({ kind: 'template', id: asset.meta.id })}>
              {asset.previewUrl ? <img className="asset-thumb checkerboard" src={asset.previewUrl} alt="" /> : <span className="asset-icon">UV</span>}
              <span className="asset-copy"><strong>{asset.meta.name}</strong><small>{formatBytes(asset.meta.size)}</small></span>
            </button>
          ))}
          {templates.length === 0 && <button className="empty-asset-row" type="button" onClick={() => void addNativeAssets('template')}>テンプレートを追加</button>}
        </section>

        {recentProjects.length > 0 && (
          <section className="panel-section recent-list">
            <div className="section-heading"><span>RECENT</span><small>{recentProjects.length}</small></div>
            {recentProjects.slice(0, 5).map((recent) => (
              <button type="button" key={recent.path} onClick={() => void openRecentProject(recent)} title={recent.path}>
                <strong>{recent.name}</strong>
                <small>{filePathName(recent.path)}</small>
              </button>
            ))}
          </section>
        )}

        <input ref={avatarInputRef} className="visually-hidden" type="file" accept=".vrm" onChange={(event) => { if (event.currentTarget.files) addFiles('avatar', Array.from(event.currentTarget.files)); event.currentTarget.value = ''; }} />
        <input ref={referenceInputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { if (event.currentTarget.files) addFiles('reference', Array.from(event.currentTarget.files)); event.currentTarget.value = ''; }} />
        <input ref={templateInputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { if (event.currentTarget.files) addFiles('template', Array.from(event.currentTarget.files)); event.currentTarget.value = ''; }} />
      </aside>

      <main className="workspace">
        <VrmViewport
          selectedFile={avatar?.file ?? null}
          command={cameraCommand}
          commandId={cameraCommandId}
          onLoadStart={handleLoadStart}
          onProgress={handleProgress}
          onLoaded={handleLoaded}
          onError={handleError}
          onStats={handleStats}
        />

        <div className="viewport-toolbar">
          <button type="button" disabled={loadState !== 'ready'} onClick={() => issueCameraCommand('fit')}>全身表示 <kbd>F</kbd></button>
          <button type="button" onClick={() => issueCameraCommand('reset')}>カメラリセット <kbd>R</kbd></button>
        </div>

        {activePreview && (
          <div className="reference-preview">
            <div>
              <strong>{selectedItem.kind === 'template' ? 'TEMPLATE PREVIEW' : 'REFERENCE PREVIEW'}</strong>
              <button type="button" onClick={() => setSelectedItem({ kind: 'project' })}>×</button>
            </div>
            <img className={selectedItem.kind === 'template' ? 'checkerboard' : ''} src={activePreview.previewUrl!} alt={activePreview.meta.name} />
            <span>{activePreview.meta.name}</span>
          </div>
        )}

        {loadState === 'loading' && (
          <div className="loading-card">
            <div className="spinner" />
            <strong>VRMを解析しています</strong>
            <span>{progress === null ? 'ファイルを展開中…' : `${Math.round(progress * 100)}%`}</span>
          </div>
        )}
        {errorMessage && (
          <div className="error-card" role="alert"><strong>読み込みエラー</strong><span>{errorMessage}</span></div>
        )}
        {notice && (
          <button className={`notice-card notice-${notice.tone}`} type="button" onClick={() => setNotice(null)}>{notice.message}</button>
        )}
      </main>

      <aside className="sidebar right-sidebar">
        <section className="panel-section">
          <div className="section-heading"><span>INSPECTOR</span><small>{selectedItem.kind.toUpperCase()}</small></div>
          {selectedItem.kind === 'project' ? (
            <dl className="inspector-grid">
              <dt>Name</dt><dd>{project.name}</dd>
              <dt>File</dt><dd title={projectPath ?? undefined}>{filePathName(projectPath)}</dd>
              <dt>Status</dt><dd>{isDirty ? '変更あり' : '保存済み'}</dd>
              <dt>Avatar</dt><dd>{avatar ? '1' : '0'}</dd>
              <dt>References</dt><dd>{references.length}</dd>
              <dt>Templates</dt><dd>{templates.length}</dd>
              <dt>Schema</dt><dd>v{project.schemaVersion}</dd>
            </dl>
          ) : selectedAsset ? (
            <>
              {selectedAsset.previewUrl && <img className={`inspector-preview ${selectedItem.kind === 'template' ? 'checkerboard' : ''}`} src={selectedAsset.previewUrl} alt={selectedAsset.meta.name} />}
              <dl className="inspector-grid">
                <dt>File</dt><dd title={selectedAsset.meta.name}>{selectedAsset.meta.name}</dd>
                <dt>Type</dt><dd>{selectedAsset.meta.kind}</dd>
                <dt>Size</dt><dd>{formatBytes(selectedAsset.meta.size)}</dd>
                <dt>Source</dt><dd title={selectedAsset.meta.sourcePath}>{selectedAsset.meta.sourcePath || 'Browser import'}</dd>
                {selectedItem.kind === 'avatar' && <><dt>Format</dt><dd>{loadResult?.specVersion ?? '—'}</dd><dt>Height</dt><dd>{loadResult ? `${loadResult.height.toFixed(3)} m` : '—'}</dd><dt>Objects</dt><dd>{loadResult?.objectCount ?? '—'}</dd></>}
              </dl>
              <button className="danger-button" type="button" onClick={() => removeAsset(selectedAsset.meta.kind, selectedAsset.meta.id)}>プロジェクトから削除</button>
            </>
          ) : <p className="muted-copy">アセットが見つかりません。</p>}
        </section>

        <section className="panel-section debug-panel">
          <div className="section-heading"><span>DEBUG</span><small>Realtime</small></div>
          <dl className="metric-grid">
            <div><dt>FPS</dt><dd>{stats.fps}</dd></div>
            <div><dt>Triangles</dt><dd>{stats.triangles.toLocaleString()}</dd></div>
            <div><dt>Draw calls</dt><dd>{stats.drawCalls}</dd></div>
            <div><dt>Textures</dt><dd>{stats.textures}</dd></div>
            <div><dt>Geometries</dt><dd>{stats.geometries}</dd></div>
            <div><dt>Engine</dt><dd>WebGL</dd></div>
          </dl>
        </section>

        <section className="panel-section help-panel">
          <div className="section-heading"><span>CONTROLS</span></div>
          <p><b>左ドラッグ</b> 回転</p><p><b>ホイール</b> ズーム</p><p><b>右ドラッグ</b> パン</p>
          <p><b>画像ドロップ</b> 参考画像</p>
        </section>
      </aside>

      <footer className="statusbar">
        <span>{APP_NAME} v{APP_VERSION}</span>
        <span>{projectPath ?? '新規プロジェクト'}</span>
        <span>Electron {electronVersion}</span>
        <span>{window.aosDesktop?.platform ?? navigator.platform}</span>
      </footer>
    </div>
  );
}
