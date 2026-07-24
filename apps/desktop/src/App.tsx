import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AosAssetKind,
  AosMaterialOverride,
  AosProjectManifest,
  AosTextureDocument,
  AosRecentProject,
  HydratedProjectPayload,
  NativeFilePayload,
} from '@ai-outfit-studio/common';
import {
  APP_NAME,
  APP_VERSION,
  createProjectManifest,
  textureDocumentAssetId,
} from '@ai-outfit-studio/common';
import type { VrmLoadResult, VrmMaterialInfo, VrmStageStats } from '@ai-outfit-studio/vrm-engine';
import { VrmViewport } from './components/VrmViewport';
import { TextureEditor } from './components/TextureEditor';
import {
  canvasToPngBlob,
  getImageDimensions,
  renderTextureDocument,
  type TextureDocumentOutput,
  type TextureSourceAsset,
} from './texture/texture-renderer';
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
  | { kind: 'reference' | 'template'; id: string }
  | { kind: 'texture-document'; id: string };
type WorkspaceMode = '3d' | 'texture';
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
  const textureOutputRef = useRef<TextureDocumentOutput[]>([]);
  const textureRenderGenerationRef = useRef(0);
  const runtimeAssetsRef = useRef<{ avatar: RuntimeAsset | null; references: RuntimeAsset[]; templates: RuntimeAsset[] }>({ avatar: null, references: [], templates: [] });

  const [project, setProject] = useState<AosProjectManifest>(() => createProjectManifest());
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [recentProjects, setRecentProjects] = useState<AosRecentProject[]>([]);
  const [avatar, setAvatar] = useState<RuntimeAsset | null>(null);
  const [references, setReferences] = useState<RuntimeAsset[]>([]);
  const [templates, setTemplates] = useState<RuntimeAsset[]>([]);
  const [textureDocuments, setTextureDocuments] = useState<AosTextureDocument[]>([]);
  const [textureOutputs, setTextureOutputs] = useState<TextureDocumentOutput[]>([]);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('3d');
  const [activeTextureDocumentId, setActiveTextureDocumentId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<VrmMaterialInfo[]>([]);
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string | null>(null);
  const [materialOverrides, setMaterialOverrides] = useState<AosMaterialOverride[]>([]);
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
      setMaterials([]);
      setSelectedMaterialKey(null);
      setMaterialOverrides([]);
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
        setMaterials([]);
        setSelectedMaterialKey(null);
        setMaterialOverrides([]);
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
    materialOverrides,
    textureDocuments,
  }), [avatar, materialOverrides, project, references, templates, textureDocuments]);

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
    setTextureDocuments([]);
    setTextureOutputs((current) => { current.forEach((output) => URL.revokeObjectURL(output.previewUrl)); return []; });
    setWorkspaceMode('3d');
    setActiveTextureDocumentId(null);
    setMaterials([]);
    setSelectedMaterialKey(null);
    setMaterialOverrides([]);
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
    setTextureDocuments(payload.manifest.textureDocuments ?? []);
    setWorkspaceMode('3d');
    setActiveTextureDocumentId(payload.manifest.textureDocuments?.[0]?.id ?? null);
    setMaterialOverrides(payload.manifest.materialOverrides ?? []);
    setMaterials([]);
    setSelectedMaterialKey(null);
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
      setMaterials([]);
      setSelectedMaterialKey(null);
      setMaterialOverrides([]);
      setErrorMessage(null);
      setStats(initialStats);
    } else if (kind === 'reference') {
      setReferences((current) => {
        const removed = current.find((asset) => asset.meta.id === id);
        disposeRuntimeAsset(removed);
        return current.filter((asset) => asset.meta.id !== id);
      });
      setTextureDocuments((current) => current.map((document) => ({
        ...document,
        layers: document.layers.filter((layer) => layer.sourceAssetId !== id),
        updatedAt: new Date().toISOString(),
      })));
    } else {
      setTemplates((current) => {
        const removed = current.find((asset) => asset.meta.id === id);
        disposeRuntimeAsset(removed);
        return current.filter((asset) => asset.meta.id !== id);
      });
      const removedDocumentIds = textureDocuments.filter((document) => document.templateAssetId === id).map((document) => document.id);
      const removedOutputIds = new Set(removedDocumentIds.map(textureDocumentAssetId));
      setTextureDocuments((current) => current
        .filter((document) => document.templateAssetId !== id)
        .map((document) => ({
          ...document,
          layers: document.layers.filter((layer) => layer.sourceAssetId !== id),
          updatedAt: new Date().toISOString(),
        })));
      setMaterialOverrides((current) => current.map((override) =>
        override.textureAssetId === id || (override.textureAssetId && removedOutputIds.has(override.textureAssetId))
          ? { ...override, textureAssetId: null }
          : override,
      ));
      if (activeTextureDocumentId && removedDocumentIds.includes(activeTextureDocumentId)) {
        setActiveTextureDocumentId(null);
        setWorkspaceMode('3d');
      }
    }
    setSelectedItem({ kind: 'project' });
    setIsDirty(true);
  }, [activeTextureDocumentId, avatar, textureDocuments]);

  const handleLoadStart = useCallback(() => {
    setLoadState('loading');
    setProgress(null);
    setErrorMessage(null);
  }, []);
  const handleProgress = useCallback((value: number | null) => setProgress(value), []);
  const handleLoaded = useCallback((result: VrmLoadResult) => {
    setLoadResult(result);
    setMaterials(result.materials);
    setSelectedMaterialKey((current) => current && result.materials.some((material) => material.key === current)
      ? current
      : result.materials[0]?.key ?? null);
    setLoadState('ready');
    setProgress(1);
  }, []);
  const handleError = useCallback((message: string) => {
    setLoadState('error');
    setErrorMessage(message);
    setProgress(null);
  }, []);
  const handleStats = useCallback((nextStats: VrmStageStats) => setStats(nextStats), []);
  const handleMaterialError = useCallback((message: string) => {
    showNotice({ tone: 'error', message });
  }, [showNotice]);


  const textureSourceAssets = useMemo<TextureSourceAsset[]>(() => [
    ...references.map((asset) => ({ id: asset.meta.id, name: asset.meta.name, file: asset.file, previewUrl: asset.previewUrl })),
    ...templates.map((asset) => ({ id: asset.meta.id, name: asset.meta.name, file: asset.file, previewUrl: asset.previewUrl })),
  ], [references, templates]);

  const activeTextureDocument = useMemo(
    () => textureDocuments.find((document) => document.id === activeTextureDocumentId) ?? null,
    [activeTextureDocumentId, textureDocuments],
  );

  const createTextureDocument = useCallback(async (template: RuntimeAsset) => {
    try {
      const dimensions = await getImageDimensions(template.file);
      const now = new Date().toISOString();
      const next: AosTextureDocument = {
        id: crypto.randomUUID(),
        name: `${template.meta.name.replace(/\.[^.]+$/, '')} Edit`,
        templateAssetId: template.meta.id,
        width: dimensions.width,
        height: dimensions.height,
        maskToTemplateAlpha: true,
        showTemplateBase: true,
        layers: [],
        createdAt: now,
        updatedAt: now,
      };
      setTextureDocuments((current) => [...current, next]);
      setActiveTextureDocumentId(next.id);
      setWorkspaceMode('texture');
      setSelectedItem({ kind: 'texture-document', id: next.id });
      setIsDirty(true);
      showNotice({ tone: 'info', message: `テクスチャ編集を開始しました：${next.name}` });
    } catch (error) {
      showNotice({ tone: 'error', message: error instanceof Error ? error.message : 'テンプレートを開けませんでした。' });
    }
  }, [showNotice]);

  const openTextureDocument = useCallback((documentId: string) => {
    setActiveTextureDocumentId(documentId);
    setWorkspaceMode('texture');
    setSelectedItem({ kind: 'texture-document', id: documentId });
  }, []);

  const updateTextureDocument = useCallback((nextDocument: AosTextureDocument) => {
    setTextureDocuments((current) => current.map((document) => document.id === nextDocument.id ? nextDocument : document));
    setIsDirty(true);
  }, []);

  const removeTextureDocument = useCallback((documentId: string) => {
    const outputId = textureDocumentAssetId(documentId);
    setTextureDocuments((current) => current.filter((document) => document.id !== documentId));
    setMaterialOverrides((current) => current.map((override) => override.textureAssetId === outputId ? { ...override, textureAssetId: null } : override));
    if (activeTextureDocumentId === documentId) {
      setActiveTextureDocumentId(null);
      setWorkspaceMode('3d');
    }
    setSelectedItem({ kind: 'project' });
    setIsDirty(true);
  }, [activeTextureDocumentId]);

  const exportTextureDocument = useCallback(async (document: AosTextureDocument) => {
    try {
      const sourceMap = new Map(textureSourceAssets.map((asset) => [asset.id, asset]));
      const canvas = await renderTextureDocument(document, sourceMap);
      const blob = await canvasToPngBlob(canvas);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const defaultName = `${document.name.replace(/[\\/:*?"<>|]/g, '_') || 'texture'}.png`;
      const desktop = window.aosDesktop;
      if (desktop) {
        const result = await desktop.exportPng({ defaultName, data: bytes });
        if (!result.canceled) showNotice({ tone: 'info', message: `PNGを書き出しました：${filePathName(result.path)}` });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = defaultName;
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      showNotice({ tone: 'error', message: error instanceof Error ? error.message : 'PNGを書き出せませんでした。' });
    }
  }, [showNotice, textureSourceAssets]);

  useEffect(() => {
    const generation = ++textureRenderGenerationRef.current;
    const timer = window.setTimeout(() => {
      if (textureDocuments.length === 0) {
        setTextureOutputs((current) => {
          current.forEach((output) => URL.revokeObjectURL(output.previewUrl));
          return [];
        });
        return;
      }
      const assetMap = new Map(textureSourceAssets.map((asset) => [asset.id, asset]));
      void Promise.all(textureDocuments.map(async (document) => {
        const canvas = await renderTextureDocument(document, assetMap);
        const blob = await canvasToPngBlob(canvas);
        const name = `${document.name.replace(/\.[^.]+$/, '')}.png`;
        const file = new File([blob], name, { type: 'image/png', lastModified: Date.now() });
        return {
          id: textureDocumentAssetId(document.id),
          documentId: document.id,
          name,
          file,
          previewUrl: URL.createObjectURL(blob),
          width: document.width,
          height: document.height,
        } satisfies TextureDocumentOutput;
      })).then((nextOutputs) => {
        if (generation !== textureRenderGenerationRef.current) {
          nextOutputs.forEach((output) => URL.revokeObjectURL(output.previewUrl));
          return;
        }
        setTextureOutputs((current) => {
          current.forEach((output) => URL.revokeObjectURL(output.previewUrl));
          return nextOutputs;
        });
      }).catch((error: unknown) => {
        if (generation === textureRenderGenerationRef.current) {
          showNotice({ tone: 'error', message: error instanceof Error ? error.message : '編集テクスチャのプレビュー生成に失敗しました。' });
        }
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [showNotice, textureDocuments, textureSourceAssets]);

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

  useEffect(() => {
    textureOutputRef.current = textureOutputs;
  }, [textureOutputs]);

  useEffect(() => () => {
    disposeRuntimeAsset(runtimeAssetsRef.current.avatar);
    disposeRuntimeAssets(runtimeAssetsRef.current.references);
    disposeRuntimeAssets(runtimeAssetsRef.current.templates);
    textureOutputRef.current.forEach((output) => URL.revokeObjectURL(output.previewUrl));
  }, []);

  const statusLabel = useMemo(() => {
    if (workspaceMode === 'texture' && activeTextureDocument) return `2D編集中：${activeTextureDocument.name}`;
    switch (loadState) {
      case 'loading': return progress === null ? '読み込み中' : `読み込み中 ${Math.round(progress * 100)}%`;
      case 'ready': return 'VRM表示準備完了';
      case 'error': return 'VRMエラー';
      default: return isDirty ? '未保存の変更あり' : 'プロジェクト準備完了';
    }
  }, [activeTextureDocument, isDirty, loadState, progress, workspaceMode]);

  const selectedAsset = useMemo(() => {
    if (selectedItem.kind === 'avatar') return avatar;
    if (selectedItem.kind === 'reference') return references.find((asset) => asset.meta.id === selectedItem.id) ?? null;
    if (selectedItem.kind === 'template') return templates.find((asset) => asset.meta.id === selectedItem.id) ?? null;
    return null;
  }, [avatar, references, selectedItem, templates]);

  const selectedTextureDocument = selectedItem.kind === 'texture-document'
    ? textureDocuments.find((document) => document.id === selectedItem.id) ?? null
    : null;
  const activePreview = workspaceMode === '3d' && selectedAsset?.previewUrl ? selectedAsset : null;
  const selectedMaterial = useMemo(
    () => materials.find((material) => material.key === selectedMaterialKey) ?? null,
    [materials, selectedMaterialKey],
  );
  const selectedMaterialOverride = useMemo(
    () => materialOverrides.find((override) => override.materialKey === selectedMaterialKey) ?? null,
    [materialOverrides, selectedMaterialKey],
  );
  const selectedMaterialSettings = useMemo(() => selectedMaterial ? {
    textureAssetId: selectedMaterialOverride?.textureAssetId ?? null,
    color: selectedMaterialOverride?.color ?? selectedMaterial.color,
    opacity: selectedMaterialOverride?.opacity ?? selectedMaterial.opacity,
    repeatX: selectedMaterialOverride?.repeatX ?? 1,
    repeatY: selectedMaterialOverride?.repeatY ?? 1,
    offsetX: selectedMaterialOverride?.offsetX ?? 0,
    offsetY: selectedMaterialOverride?.offsetY ?? 0,
  } : null, [selectedMaterial, selectedMaterialOverride]);
  const textureAssetInputs = useMemo(
    () => [
      ...templates.map((asset) => ({ id: asset.meta.id, file: asset.file })),
      ...textureOutputs.map((output) => ({ id: output.id, file: output.file })),
    ],
    [templates, textureOutputs],
  );

  const updateSelectedMaterial = useCallback((patch: Partial<AosMaterialOverride>) => {
    if (!selectedMaterial) return;
    setMaterialOverrides((current) => {
      const index = current.findIndex((override) => override.materialKey === selectedMaterial.key);
      const existing = index >= 0 ? current[index]! : {
        materialKey: selectedMaterial.key,
        materialName: selectedMaterial.name,
        textureAssetId: null,
        color: selectedMaterial.color,
        opacity: selectedMaterial.opacity,
        repeatX: 1,
        repeatY: 1,
        offsetX: 0,
        offsetY: 0,
      };
      const nextOverride: AosMaterialOverride = { ...existing, ...patch };
      if (index < 0) return [...current, nextOverride];
      return current.map((override, overrideIndex) => overrideIndex === index ? nextOverride : override);
    });
    setIsDirty(true);
  }, [selectedMaterial]);

  const resetSelectedMaterial = useCallback(() => {
    if (!selectedMaterialKey) return;
    setMaterialOverrides((current) => current.filter((override) => override.materialKey !== selectedMaterialKey));
    setIsDirty(true);
  }, [selectedMaterialKey]);

  const resetAllMaterials = useCallback(() => {
    if (materialOverrides.length === 0) return;
    setMaterialOverrides([]);
    setIsDirty(true);
  }, [materialOverrides.length]);

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
          <div className="section-heading"><span>PROJECT</span><small>Texture Editor</small></div>
          <div className="button-grid">
            <button className="secondary-button" type="button" onClick={() => void newProject()}>新規 <kbd>Ctrl+N</kbd></button>
            <button className="secondary-button" type="button" onClick={() => void openProject()}>開く <kbd>Ctrl+O</kbd></button>
          </div>
          <button className="primary-button" type="button" onClick={() => void saveProject(false)}>プロジェクトを保存</button>
          <button className="text-button" type="button" onClick={() => void saveProject(true)}>名前を付けて保存</button>
        </section>

        <section className="panel-section asset-list">
          <div className="section-heading"><span>ASSETS</span><small>{(avatar ? 1 : 0) + references.length + templates.length + textureDocuments.length}</small></div>

          <div className="asset-group-heading">
            <span>AVATAR</span>
            <button type="button" onClick={() => void addNativeAssets('avatar')}>＋</button>
          </div>
          {avatar ? (
            <button className={`asset-row ${selectedItem.kind === 'avatar' ? 'active' : ''}`} type="button" onClick={() => { setSelectedItem({ kind: 'avatar', id: avatar.meta.id }); setWorkspaceMode('3d'); }}>
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
            <button className={`asset-row ${selectedItem.kind === 'template' && selectedItem.id === asset.meta.id ? 'active' : ''}`} type="button" key={asset.meta.id} onClick={() => setSelectedItem({ kind: 'template', id: asset.meta.id })} onDoubleClick={() => void createTextureDocument(asset)}>
              {asset.previewUrl ? <img className="asset-thumb checkerboard" src={asset.previewUrl} alt="" /> : <span className="asset-icon">UV</span>}
              <span className="asset-copy"><strong>{asset.meta.name}</strong><small>{formatBytes(asset.meta.size)}</small></span>
            </button>
          ))}
          {templates.length === 0 && <button className="empty-asset-row" type="button" onClick={() => void addNativeAssets('template')}>テンプレートを追加</button>}

          <div className="asset-group-heading">
            <span>TEXTURE DOCS <b>{textureDocuments.length}</b></span>
          </div>
          {textureDocuments.map((document) => {
            const output = textureOutputs.find((item) => item.documentId === document.id);
            return (
              <button className={`asset-row ${selectedItem.kind === 'texture-document' && selectedItem.id === document.id ? 'active' : ''}`} type="button" key={document.id} onClick={() => openTextureDocument(document.id)}>
                {output ? <img className="asset-thumb checkerboard" src={output.previewUrl} alt="" /> : <span className="asset-icon">2D</span>}
                <span className="asset-copy"><strong>{document.name}</strong><small>{document.width} × {document.height} · {document.layers.length} layers</small></span>
              </button>
            );
          })}
          {textureDocuments.length === 0 && <div className="asset-empty-copy">テンプレートを選択し「2D編集を開始」</div>}
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
        {workspaceMode === 'texture' && activeTextureDocument ? (
          <TextureEditor
            document={activeTextureDocument}
            assets={textureSourceAssets}
            onChange={updateTextureDocument}
            onExport={(document) => void exportTextureDocument(document)}
            onShow3d={() => setWorkspaceMode('3d')}
          />
        ) : (
          <>
            <VrmViewport
              selectedFile={avatar?.file ?? null}
              materialOverrides={materialOverrides}
              textureAssets={textureAssetInputs}
              command={cameraCommand}
              commandId={cameraCommandId}
              onLoadStart={handleLoadStart}
              onProgress={handleProgress}
              onLoaded={handleLoaded}
              onError={handleError}
              onStats={handleStats}
              onMaterialError={handleMaterialError}
            />

            <div className="viewport-toolbar">
              <button type="button" disabled={loadState !== 'ready'} onClick={() => issueCameraCommand('fit')}>全身表示 <kbd>F</kbd></button>
              <button type="button" onClick={() => issueCameraCommand('reset')}>カメラリセット <kbd>R</kbd></button>
              {activeTextureDocument && <button type="button" onClick={() => setWorkspaceMode('texture')}>2D編集へ</button>}
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
          </>
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
              <dt>Texture docs</dt><dd>{textureDocuments.length}</dd>
              <dt>Materials</dt><dd>{materials.length}</dd>
              <dt>Overrides</dt><dd>{materialOverrides.length}</dd>
              <dt>Schema</dt><dd>v{project.schemaVersion}</dd>
            </dl>
          ) : selectedTextureDocument ? (
            <>
              {textureOutputs.find((output) => output.documentId === selectedTextureDocument.id) && (
                <img className="inspector-preview checkerboard" src={textureOutputs.find((output) => output.documentId === selectedTextureDocument.id)!.previewUrl} alt={selectedTextureDocument.name} />
              )}
              <dl className="inspector-grid">
                <dt>Name</dt><dd>{selectedTextureDocument.name}</dd>
                <dt>Canvas</dt><dd>{selectedTextureDocument.width} × {selectedTextureDocument.height}</dd>
                <dt>Layers</dt><dd>{selectedTextureDocument.layers.length}</dd>
                <dt>Alpha mask</dt><dd>{selectedTextureDocument.maskToTemplateAlpha ? 'ON' : 'OFF'}</dd>
                <dt>Base</dt><dd>{selectedTextureDocument.showTemplateBase ? '表示' : '非表示'}</dd>
              </dl>
              <button className="primary-button inspector-action" type="button" onClick={() => openTextureDocument(selectedTextureDocument.id)}>2D編集を開く</button>
              <button className="secondary-button inspector-action" type="button" onClick={() => void exportTextureDocument(selectedTextureDocument)}>PNG書き出し</button>
              <button className="danger-button" type="button" onClick={() => removeTextureDocument(selectedTextureDocument.id)}>編集ドキュメントを削除</button>
            </>
          ) : selectedAsset ? (
            <>
              {selectedAsset.previewUrl && <img className={`inspector-preview ${selectedItem.kind === 'template' ? 'checkerboard' : ''}`} src={selectedAsset.previewUrl} alt={selectedAsset.meta.name} />}
              <dl className="inspector-grid">
                <dt>File</dt><dd title={selectedAsset.meta.name}>{selectedAsset.meta.name}</dd>
                <dt>Type</dt><dd>{selectedAsset.meta.kind}</dd>
                <dt>Size</dt><dd>{formatBytes(selectedAsset.meta.size)}</dd>
                <dt>Source</dt><dd title={selectedAsset.meta.sourcePath}>{selectedAsset.meta.sourcePath || 'Browser import'}</dd>
                {selectedItem.kind === 'avatar' && <><dt>Format</dt><dd>{loadResult?.specVersion ?? '—'}</dd><dt>Height</dt><dd>{loadResult ? `${loadResult.height.toFixed(3)} m` : '—'}</dd><dt>Objects</dt><dd>{loadResult?.objectCount ?? '—'}</dd><dt>Materials</dt><dd>{materials.length || '—'}</dd></>}
              </dl>
              {selectedItem.kind === 'template' && <button className="primary-button inspector-action" type="button" onClick={() => void createTextureDocument(selectedAsset)}>2D編集を開始</button>}
              <button className="danger-button" type="button" onClick={() => removeAsset(selectedAsset.meta.kind, selectedAsset.meta.id)}>プロジェクトから削除</button>
            </>
          ) : <p className="muted-copy">アセットが見つかりません。</p>}
        </section>

        <section className="panel-section material-panel">
          <div className="section-heading"><span>MATERIALS</span><small>{materials.length}</small></div>
          {materials.length === 0 ? (
            <p className="muted-copy">VRMを読み込むとマテリアル一覧が表示されます。</p>
          ) : (
            <>
              <div className="material-list" role="listbox" aria-label="VRMマテリアル一覧">
                {materials.map((material) => {
                  const override = materialOverrides.find((item) => item.materialKey === material.key);
                  return (
                    <button
                      type="button"
                      key={material.key}
                      className={selectedMaterialKey === material.key ? 'active' : ''}
                      onClick={() => setSelectedMaterialKey(material.key)}
                      title={material.name}
                    >
                      <span className="material-swatch" style={{ background: override?.color ?? material.color }} />
                      <span><strong>{material.name}</strong><small>{material.type} · {material.meshCount} mesh{material.meshCount === 1 ? '' : 'es'}</small></span>
                      {override && <b>EDIT</b>}
                    </button>
                  );
                })}
              </div>

              {selectedMaterial && selectedMaterialSettings && (
                <div className="material-editor">
                  <dl className="material-summary">
                    <dt>Material</dt><dd title={selectedMaterial.name}>{selectedMaterial.name}</dd>
                    <dt>Original map</dt><dd>{selectedMaterial.hasBaseColorTexture ? 'あり' : 'なし'}</dd>
                  </dl>

                  <label className="field-label">
                    <span>プレビューテクスチャ</span>
                    <select
                      value={selectedMaterialSettings.textureAssetId ?? ''}
                      onChange={(event) => {
                        const textureAssetId = event.target.value || null;
                        updateSelectedMaterial({
                          textureAssetId,
                          color: textureAssetId && !selectedMaterialSettings.textureAssetId
                            ? '#ffffff'
                            : selectedMaterialSettings.color,
                        });
                      }}
                    >
                      <option value="">元のテクスチャ</option>
                      {textureOutputs.length > 0 && <optgroup label="2D編集結果">{textureOutputs.map((output) => <option key={output.id} value={output.id}>{output.name}</option>)}</optgroup>}
                      {templates.length > 0 && <optgroup label="テンプレート">{templates.map((asset) => <option key={asset.meta.id} value={asset.meta.id}>{asset.meta.name}</option>)}</optgroup>}
                    </select>
                  </label>
                  {templates.length === 0 && textureOutputs.length === 0 && <p className="field-help">先にVRoidテンプレート画像を追加してください。</p>}

                  <div className="material-control-row">
                    <label className="field-label compact-field">
                      <span>色</span>
                      <input type="color" value={selectedMaterialSettings.color} onChange={(event) => updateSelectedMaterial({ color: event.target.value })} />
                    </label>
                    <label className="field-label opacity-field">
                      <span>不透明度 <b>{Math.round(selectedMaterialSettings.opacity * 100)}%</b></span>
                      <input type="range" min="0" max="1" step="0.01" value={selectedMaterialSettings.opacity} onChange={(event) => updateSelectedMaterial({ opacity: Number(event.target.value) })} />
                    </label>
                  </div>

                  <div className="uv-transform-grid">
                    <label><span>Repeat X</span><input type="number" min="0.01" max="20" step="0.05" value={selectedMaterialSettings.repeatX} onChange={(event) => updateSelectedMaterial({ repeatX: Number(event.target.value) || 0.01 })} /></label>
                    <label><span>Repeat Y</span><input type="number" min="0.01" max="20" step="0.05" value={selectedMaterialSettings.repeatY} onChange={(event) => updateSelectedMaterial({ repeatY: Number(event.target.value) || 0.01 })} /></label>
                    <label><span>Offset X</span><input type="number" min="-10" max="10" step="0.01" value={selectedMaterialSettings.offsetX} onChange={(event) => updateSelectedMaterial({ offsetX: Number(event.target.value) || 0 })} /></label>
                    <label><span>Offset Y</span><input type="number" min="-10" max="10" step="0.01" value={selectedMaterialSettings.offsetY} onChange={(event) => updateSelectedMaterial({ offsetY: Number(event.target.value) || 0 })} /></label>
                  </div>

                  <div className="material-actions">
                    <button className="secondary-button" type="button" disabled={!selectedMaterialOverride} onClick={resetSelectedMaterial}>選択を元に戻す</button>
                    <button className="danger-button" type="button" disabled={materialOverrides.length === 0} onClick={resetAllMaterials}>全て元に戻す</button>
                  </div>
                </div>
              )}
            </>
          )}
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
