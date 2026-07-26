import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type {
  AosAssetKind,
  AosAiJob,
  AosAiMaskMode,
  AosAiSettings,
  AosMaterialOverride,
  AosProjectAsset,
  AosProjectManifest,
  AosTextureDocument,
  AosTextureLayer,
  AosRecentProject,
  HydratedProjectPayload,
  NativeFilePayload,
  ComfyUiConnectionResult,
  ComfyUiRunRequest,
  ComfyUiRunResult,
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


function defaultAiSettings(): AosAiSettings {
  return {
    provider: 'comfyui',
    endpoint: 'http://127.0.0.1:8188',
    workflowName: '',
    workflowJson: '',
    positivePrompt: 'flat VRoid clothing texture, garment fabric only, isolated clothing design, no human body, preserve the exact UV template layout, transfer only colors, fabric patterns, trims, ribbons, lace and garment decorations, high quality',
    negativePrompt: 'person, character, human body, face, head, hair, eyes, arms, hands, fingers, legs, thighs, skin, shoes, full body illustration, character silhouette, background, text, logo, watermark, broken UV layout, cropped texture',
    maskMode: 'template-alpha',
    mode: 'prompt-only',
    referenceAssetId: null,
    referenceStrength: 0.7,
    denoiseStrength: 0.55,
    templatePreserve: 0.85,
    referencePrep: {
      extractMode: 'auto-corners',
      threshold: 0.14,
      feather: 0.08,
      fitMode: 'template-bounds',
      padding: 0.04,
    },
    timeoutSeconds: 300,
    autoAddResultLayer: true,
  };
}

function normalizeAiSettings(value: unknown): AosAiSettings {
  const fallback = defaultAiSettings();
  if (!value || typeof value !== 'object') return fallback;
  const settings = value as Partial<AosAiSettings>;
  const legacyPositivePrompt = 'high quality VRoid clothing texture, preserve UV layout, seamless garment details';
  const legacyNegativePrompt = 'text, watermark, logo, extra objects, broken UV layout, cropped texture';
  const maskModes = new Set<AosAiMaskMode>(['template-alpha', 'selected-layer-eraser', 'full-canvas']);
  const aiModes = new Set(['prompt-only', 'reference-guided', 'reference-inpaint']);
  const timeout = typeof settings.timeoutSeconds === 'number' && Number.isFinite(settings.timeoutSeconds)
    ? Math.min(3600, Math.max(30, Math.round(settings.timeoutSeconds)))
    : fallback.timeoutSeconds;
  const clampUnit = (value: unknown, nextFallback: number) => typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : nextFallback;
  const prep = settings.referencePrep && typeof settings.referencePrep === 'object'
    ? settings.referencePrep as Partial<AosAiSettings['referencePrep']>
    : {};
  const extractModes = new Set(['auto-corners', 'white-background', 'black-background', 'alpha-only']);
  const fitModes = new Set(['template-bounds', 'contain', 'cover']);
  return {
    provider: 'comfyui',
    endpoint: typeof settings.endpoint === 'string' && settings.endpoint.trim() ? settings.endpoint.trim() : fallback.endpoint,
    workflowName: typeof settings.workflowName === 'string' ? settings.workflowName : '',
    workflowJson: typeof settings.workflowJson === 'string' ? settings.workflowJson : '',
    positivePrompt: typeof settings.positivePrompt === 'string'
      ? (settings.positivePrompt.trim() === legacyPositivePrompt ? fallback.positivePrompt : settings.positivePrompt)
      : fallback.positivePrompt,
    negativePrompt: typeof settings.negativePrompt === 'string'
      ? (settings.negativePrompt.trim() === legacyNegativePrompt ? fallback.negativePrompt : settings.negativePrompt)
      : fallback.negativePrompt,
    maskMode: maskModes.has(settings.maskMode as AosAiMaskMode) ? settings.maskMode as AosAiMaskMode : fallback.maskMode,
    mode: aiModes.has(settings.mode as string) ? settings.mode as AosAiSettings['mode'] : fallback.mode,
    referenceAssetId: typeof settings.referenceAssetId === 'string' && settings.referenceAssetId.trim() ? settings.referenceAssetId : null,
    referenceStrength: clampUnit(settings.referenceStrength, fallback.referenceStrength),
    denoiseStrength: clampUnit(settings.denoiseStrength, fallback.denoiseStrength),
    templatePreserve: clampUnit(settings.templatePreserve, fallback.templatePreserve),
    referencePrep: {
      extractMode: extractModes.has(prep.extractMode as string) ? prep.extractMode as AosAiSettings['referencePrep']['extractMode'] : fallback.referencePrep.extractMode,
      threshold: clampUnit(prep.threshold, fallback.referencePrep.threshold),
      feather: clampUnit(prep.feather, fallback.referencePrep.feather),
      fitMode: fitModes.has(prep.fitMode as string) ? prep.fitMode as AosAiSettings['referencePrep']['fitMode'] : fallback.referencePrep.fitMode,
      padding: Math.min(0.3, clampUnit(prep.padding, fallback.referencePrep.padding)),
    },
    timeoutSeconds: timeout,
    autoAddResultLayer: settings.autoAddResultLayer !== false,
  };
}

function normalizeAiJobs(value: unknown): AosAiJob[] {
  if (!Array.isArray(value)) return [];
  const maskModes = new Set<AosAiMaskMode>(['template-alpha', 'selected-layer-eraser', 'full-canvas']);
  const aiModes = new Set(['prompt-only', 'reference-guided', 'reference-inpaint']);
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const job = entry as Partial<AosAiJob>;
    if (typeof job.id !== 'string' || typeof job.documentId !== 'string' || typeof job.documentName !== 'string') return [];
    const status = job.status === 'completed' || job.status === 'failed' ? job.status : 'failed';
    return [{
      id: job.id,
      provider: 'comfyui' as const,
      documentId: job.documentId,
      documentName: job.documentName,
      status,
      positivePrompt: typeof job.positivePrompt === 'string' ? job.positivePrompt : '',
      negativePrompt: typeof job.negativePrompt === 'string' ? job.negativePrompt : '',
      maskMode: maskModes.has(job.maskMode as AosAiMaskMode) ? job.maskMode as AosAiMaskMode : 'template-alpha',
      mode: aiModes.has(job.mode as string) ? job.mode as AosAiJob['mode'] : 'prompt-only',
      referenceAssetId: typeof job.referenceAssetId === 'string' && job.referenceAssetId ? job.referenceAssetId : null,
      referenceAssetName: typeof job.referenceAssetName === 'string' ? job.referenceAssetName : null,
      workflowName: typeof job.workflowName === 'string' ? job.workflowName : '',
      createdAt: typeof job.createdAt === 'string' ? job.createdAt : new Date().toISOString(),
      completedAt: typeof job.completedAt === 'string' ? job.completedAt : null,
      promptId: typeof job.promptId === 'string' ? job.promptId : null,
      outputAssetId: typeof job.outputAssetId === 'string' ? job.outputAssetId : null,
      error: typeof job.error === 'string' ? job.error : null,
    }];
  }).slice(-100);
}

function validateManifest(value: unknown): AosProjectManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('プロジェクトファイルの形式が正しくありません。');
  }

  const manifest = value as Partial<Omit<AosProjectManifest, 'schemaVersion' | 'materialOverrides' | 'textureDocuments' | 'aiSettings' | 'aiJobs'>> & {
    schemaVersion?: number;
    materialOverrides?: unknown;
    textureDocuments?: unknown;
    aiSettings?: unknown;
    aiJobs?: unknown;
  };
  if (
    (manifest.schemaVersion !== 1 && manifest.schemaVersion !== 2 && manifest.schemaVersion !== 3 && manifest.schemaVersion !== 4 && manifest.schemaVersion !== 5 && manifest.schemaVersion !== 6) ||
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

  const assets = manifest.assets as AosProjectManifest['assets'] & { generated?: AosProjectAsset[] };
  return {
    ...(manifest as Omit<AosProjectManifest, 'schemaVersion' | 'assets' | 'materialOverrides' | 'textureDocuments' | 'aiSettings' | 'aiJobs'>),
    schemaVersion: 6,
    assets: {
      avatar: assets.avatar ?? null,
      references: assets.references,
      templates: assets.templates,
      generated: Array.isArray(assets.generated) ? assets.generated : [],
    },
    materialOverrides: normalizeMaterialOverrides(manifest.materialOverrides),
    textureDocuments: normalizeTextureDocuments(manifest.textureDocuments),
    aiSettings: normalizeAiSettings(manifest.aiSettings),
    aiJobs: normalizeAiJobs(manifest.aiJobs),
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

  const [avatar, references, templates, generated] = await Promise.all([
    hydrateAsset(manifest.assets.avatar, missingAssetPaths),
    hydrateAssets(manifest.assets.references, missingAssetPaths),
    hydrateAssets(manifest.assets.templates, missingAssetPaths),
    hydrateAssets(manifest.assets.generated, missingAssetPaths),
  ]);

  await touchRecentProject(projectPath, manifest);

  return {
    path: projectPath,
    manifest,
    assets: { avatar, references, templates, generated },
    missingAssetPaths,
  };
}


function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  const url = new URL(trimmed);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('ComfyUIの接続先は http:// または https:// で指定してください。');
  }
  return url.toString().replace(/\/$/, '');
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('ComfyUIへの接続がタイムアウトしました。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function humanBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '不明';
  const gib = value / 1024 / 1024 / 1024;
  return `${gib.toFixed(1)} GB`;
}

async function testComfyUiConnection(endpoint: string): Promise<ComfyUiConnectionResult> {
  try {
    const base = normalizeEndpoint(endpoint);
    const response = await fetchWithTimeout(`${base}/system_stats`, {}, 10000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json() as {
      system?: { os?: string };
      devices?: Array<{ name?: string; vram_total?: number }>;
    };
    const device = payload.devices?.[0];
    const deviceName = typeof device?.name === 'string' ? device.name : null;
    const vramTotal = typeof device?.vram_total === 'number' ? device.vram_total : null;
    return {
      ok: true,
      message: `接続成功${deviceName ? `：${deviceName}` : ''}${vramTotal ? ` / VRAM ${humanBytes(vramTotal)}` : ''}`,
      deviceName,
      vramTotal,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'ComfyUIへ接続できませんでした。',
      deviceName: null,
      vramTotal: null,
    };
  }
}

function replaceWorkflowTokens(value: unknown, tokens: Record<string, string>): unknown {
  if (value === '__AOS_SEED__') return Number(tokens.__AOS_SEED__);
  if (typeof value === 'string') {
    let next = value;
    for (const [token, replacement] of Object.entries(tokens)) {
      next = next.split(token).join(replacement);
    }
    return next;
  }
  if (Array.isArray(value)) return value.map((entry) => replaceWorkflowTokens(entry, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceWorkflowTokens(entry, tokens)]));
  }
  return value;
}


function autoInjectCommonComfyNodes(graph: unknown, tokens: Record<string, string>): void {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return;
  const nodes = Object.values(graph as Record<string, unknown>).filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object' && !Array.isArray(node));
  const imageNodes: Array<{ node: Record<string, unknown>; title: string }> = [];
  const textNodes: Array<{ node: Record<string, unknown>; title: string }> = [];

  for (const node of nodes) {
    const classType = typeof node.class_type === 'string' ? node.class_type : '';
    const meta = node._meta && typeof node._meta === 'object' ? node._meta as { title?: unknown } : null;
    const title = typeof meta?.title === 'string' ? meta.title.toLowerCase() : '';
    if ((classType === 'LoadImage' || classType === 'LoadImageMask') && node.inputs && typeof node.inputs === 'object') imageNodes.push({ node, title });
    if (classType === 'CLIPTextEncode' && node.inputs && typeof node.inputs === 'object') textNodes.push({ node, title });
    if ((classType === 'SaveImage' || classType === 'SaveAnimatedWEBP') && node.inputs && typeof node.inputs === 'object') {
      (node.inputs as Record<string, unknown>).filename_prefix = tokens.__AOS_OUTPUT_PREFIX__;
    }
    if ((classType === 'KSampler' || classType === 'KSamplerAdvanced') && node.inputs && typeof node.inputs === 'object') {
      const inputs = node.inputs as Record<string, unknown>;
      if ('denoise' in inputs) inputs.denoise = Number(tokens.__AOS_DENOISE__);
      if ('seed' in inputs && typeof inputs.seed === 'string') inputs.seed = Number(tokens.__AOS_SEED__);
    }
    if ((classType.toLowerCase().includes('ipadapter') || title.includes('ipadapter')) && node.inputs && typeof node.inputs === 'object') {
      const inputs = node.inputs as Record<string, unknown>;
      if ('weight' in inputs) inputs.weight = Number(tokens.__AOS_REFERENCE_STRENGTH__);
      if ('weight_type' in inputs && typeof inputs.weight_type === 'string' && !inputs.weight_type) inputs.weight_type = 'linear';
    }
  }

  let inputAssigned = false;
  let maskAssigned = false;
  let referenceAssigned = false;
  for (const entry of imageNodes) {
    const inputs = entry.node.inputs as Record<string, unknown>;
    const title = entry.title;
    if (title.includes('reference') || title.includes('style') || title.includes('ipadapter')) {
      if (tokens.__AOS_REFERENCE_IMAGE__) {
        inputs.image = tokens.__AOS_REFERENCE_IMAGE__;
        referenceAssigned = true;
      }
    } else if (title.includes('mask')) {
      inputs.image = tokens.__AOS_MASK_IMAGE__;
      maskAssigned = true;
    } else if (title.includes('input') || title.includes('source') || title.includes('image')) {
      inputs.image = tokens.__AOS_INPUT_IMAGE__;
      inputAssigned = true;
    } else if (!inputAssigned) {
      inputs.image = tokens.__AOS_INPUT_IMAGE__;
      inputAssigned = true;
    } else if (!maskAssigned) {
      inputs.image = tokens.__AOS_MASK_IMAGE__;
      maskAssigned = true;
    } else if (!referenceAssigned && tokens.__AOS_REFERENCE_IMAGE__) {
      inputs.image = tokens.__AOS_REFERENCE_IMAGE__;
      referenceAssigned = true;
    }
  }

  let positiveAssigned = false;
  let negativeAssigned = false;
  for (const entry of textNodes) {
    const inputs = entry.node.inputs as Record<string, unknown>;
    if (entry.title.includes('negative')) {
      inputs.text = tokens.__AOS_NEGATIVE_PROMPT__;
      negativeAssigned = true;
    } else if (entry.title.includes('positive') || entry.title.includes('prompt')) {
      inputs.text = tokens.__AOS_POSITIVE_PROMPT__;
      positiveAssigned = true;
    } else if (!positiveAssigned) {
      inputs.text = tokens.__AOS_POSITIVE_PROMPT__;
      positiveAssigned = true;
    } else if (!negativeAssigned) {
      inputs.text = tokens.__AOS_NEGATIVE_PROMPT__;
      negativeAssigned = true;
    }
  }
}

async function uploadComfyImage(base: string, bytes: Uint8Array, filename: string): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const form = new FormData();
  form.append('image', new Blob([copy.buffer], { type: 'image/png' }), filename);
  form.append('type', 'input');
  form.append('overwrite', 'true');
  const response = await fetchWithTimeout(`${base}/upload/image`, { method: 'POST', body: form }, 60000);
  if (!response.ok) throw new Error(`ComfyUIへの画像アップロードに失敗しました（HTTP ${response.status}）。`);
  const result = await response.json() as { name?: string; subfolder?: string };
  if (!result.name) throw new Error('ComfyUIからアップロード画像名が返されませんでした。');
  return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
}

function findOutputImage(historyEntry: unknown): { nodeId: string; filename: string; subfolder: string; type: string } | null {
  if (!historyEntry || typeof historyEntry !== 'object') return null;
  const outputs = (historyEntry as { outputs?: unknown }).outputs;
  if (!outputs || typeof outputs !== 'object') return null;
  for (const [nodeId, output] of Object.entries(outputs)) {
    if (!output || typeof output !== 'object') continue;
    const images = (output as { images?: unknown }).images;
    if (!Array.isArray(images)) continue;
    const image = images.find((entry) => entry && typeof entry === 'object' && typeof (entry as { filename?: unknown }).filename === 'string');
    if (!image || typeof image !== 'object') continue;
    const data = image as { filename: string; subfolder?: string; type?: string };
    return { nodeId, filename: data.filename, subfolder: data.subfolder ?? '', type: data.type ?? 'output' };
  }
  return null;
}

async function saveGeneratedOutput(projectId: string, filename: string, bytes: Uint8Array): Promise<NativeFilePayload> {
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'project';
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_') || `aos-ai-${Date.now()}.png`;
  const directory = path.join(app.getPath('userData'), 'generated', safeProject);
  await mkdir(directory, { recursive: true });
  const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
  const targetPath = path.join(directory, uniqueName.toLowerCase().endsWith('.png') ? uniqueName : `${uniqueName}.png`);
  await writeFile(targetPath, Buffer.from(bytes));
  return readNativeFile(targetPath);
}

async function runComfyUi(request: ComfyUiRunRequest): Promise<ComfyUiRunResult> {
  const base = normalizeEndpoint(request.endpoint);
  let parsed: unknown;
  try {
    parsed = JSON.parse(request.workflowJson);
  } catch {
    throw new Error('ComfyUI Workflow JSONを解析できません。API形式のJSONを読み込んでください。');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('ComfyUI Workflow JSONが空です。');

  const inputName = await uploadComfyImage(base, request.inputImage, `aos-input-${request.documentId}.png`);
  const maskName = await uploadComfyImage(base, request.maskImage, `aos-mask-${request.documentId}.png`);
  const referenceName = request.referenceImage ? await uploadComfyImage(base, request.referenceImage, `aos-reference-${request.documentId}.png`) : '';
  const outputPrefix = request.outputPrefix.replace(/[\\/:*?"<>|]/g, '_') || 'AOS_Output';
  const seed = String(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
  const tokens = {
    '__AOS_POSITIVE_PROMPT__': request.positivePrompt,
    '__AOS_NEGATIVE_PROMPT__': request.negativePrompt,
    '__AOS_INPUT_IMAGE__': inputName,
    '__AOS_MASK_IMAGE__': maskName,
    '__AOS_REFERENCE_IMAGE__': referenceName,
    '__AOS_REFERENCE_STRENGTH__': String(request.referenceStrength),
    '__AOS_DENOISE__': String(request.denoiseStrength),
    '__AOS_TEMPLATE_PRESERVE__': String(request.templatePreserve),
    '__AOS_MODE__': request.mode,
    '__AOS_OUTPUT_PREFIX__': outputPrefix,
    '__AOS_SEED__': seed,
  };
  const workflowContainer = parsed as { prompt?: unknown };
  const promptGraph = replaceWorkflowTokens(workflowContainer.prompt && typeof workflowContainer.prompt === 'object' ? workflowContainer.prompt : parsed, tokens);
  autoInjectCommonComfyNodes(promptGraph, tokens);
  const clientId = crypto.randomUUID();
  const queueResponse = await fetchWithTimeout(`${base}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: promptGraph, client_id: clientId }),
  }, 30000);
  if (!queueResponse.ok) {
    const detail = await queueResponse.text().catch(() => '');
    throw new Error(`ComfyUIへのキュー登録に失敗しました（HTTP ${queueResponse.status}）。${detail.slice(0, 300)}`);
  }
  const queued = await queueResponse.json() as { prompt_id?: string; error?: unknown; node_errors?: unknown };
  if (!queued.prompt_id) throw new Error(`ComfyUIからprompt_idが返されませんでした。${queued.error ? ` ${JSON.stringify(queued.error)}` : ''}`);
  const promptId = queued.prompt_id;
  const deadline = Date.now() + Math.min(3600, Math.max(30, request.timeoutSeconds)) * 1000;
  let outputImage: ReturnType<typeof findOutputImage> = null;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const historyResponse = await fetchWithTimeout(`${base}/history/${encodeURIComponent(promptId)}`, {}, 15000);
    if (!historyResponse.ok) continue;
    const history = await historyResponse.json() as Record<string, unknown>;
    const entry = history[promptId];
    outputImage = findOutputImage(entry);
    if (outputImage) break;
    const status = entry && typeof entry === 'object' ? (entry as { status?: { status_str?: string; completed?: boolean } }).status : undefined;
    if (status?.status_str === 'error') throw new Error('ComfyUIワークフローの実行中にエラーが発生しました。ComfyUIのコンソールを確認してください。');
    if (status?.completed) throw new Error('ComfyUIの処理は完了しましたが、出力画像が見つかりません。Save Imageノードを確認してください。');
  }
  if (!outputImage) throw new Error('ComfyUI処理がタイムアウトしました。タイムアウト設定またはワークフローを確認してください。');

  const query = new URLSearchParams({
    filename: outputImage.filename,
    subfolder: outputImage.subfolder,
    type: outputImage.type,
  });
  const outputResponse = await fetchWithTimeout(`${base}/view?${query.toString()}`, {}, 60000);
  if (!outputResponse.ok) throw new Error(`ComfyUIの出力画像を取得できませんでした（HTTP ${outputResponse.status}）。`);
  const outputBytes = new Uint8Array(await outputResponse.arrayBuffer());
  const output = await saveGeneratedOutput(request.projectId, outputImage.filename, outputBytes);
  return { promptId, outputNodeId: outputImage.nodeId, output };
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

  window.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
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

  ipcMain.handle('asset:save-generated', async (_event, request: { projectId: string; filename: string; data: Uint8Array }) => {
    return saveGeneratedOutput(request.projectId, request.filename, request.data);
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

  ipcMain.handle('ai:pick-workflow', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'ComfyUI API Workflow JSONを選択',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const workflowPath = result.filePaths[0];
    return { path: workflowPath, name: path.basename(workflowPath), json: await readFile(workflowPath, 'utf8') };
  });

  ipcMain.handle('ai:comfy-test', async (_event, endpoint: string) => testComfyUiConnection(endpoint));
  ipcMain.handle('ai:comfy-run', async (_event, request: ComfyUiRunRequest) => runComfyUi(request));

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
