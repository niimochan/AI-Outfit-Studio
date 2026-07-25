export const APP_NAME = 'AI Outfit Studio';
export const APP_VERSION = '0.5.1';
export const AOS_PROJECT_SCHEMA_VERSION = 5;

export type AosAssetKind = 'avatar' | 'reference' | 'template' | 'generated';

export interface AosProjectAsset {
  id: string;
  kind: AosAssetKind;
  name: string;
  sourcePath: string;
  size: number;
  mimeType: string;
  importedAt: string;
}

export interface AosMaterialOverride {
  materialKey: string;
  materialName: string;
  textureAssetId: string | null;
  color: string;
  opacity: number;
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

export type AosTextureBlendMode = 'source-over' | 'multiply' | 'screen' | 'overlay';

export interface AosTextureEraserStroke {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface AosTextureLayer {
  id: string;
  name: string;
  sourceAssetId: string;
  visible: boolean;
  opacity: number;
  blendMode: AosTextureBlendMode;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  eraserStrokes: AosTextureEraserStroke[];
}

export interface AosTextureDocument {
  id: string;
  name: string;
  templateAssetId: string;
  width: number;
  height: number;
  maskToTemplateAlpha: boolean;
  showTemplateBase: boolean;
  layers: AosTextureLayer[];
  createdAt: string;
  updatedAt: string;
}

export type AosAiProvider = 'comfyui';
export type AosAiMaskMode = 'template-alpha' | 'selected-layer-eraser' | 'full-canvas';
export type AosAiJobStatus = 'running' | 'completed' | 'failed';
export type AosAiMode = 'prompt-only' | 'reference-guided' | 'reference-inpaint';

export interface AosAiSettings {
  provider: AosAiProvider;
  endpoint: string;
  workflowName: string;
  workflowJson: string;
  positivePrompt: string;
  negativePrompt: string;
  maskMode: AosAiMaskMode;
  mode: AosAiMode;
  referenceAssetId: string | null;
  referenceStrength: number;
  denoiseStrength: number;
  templatePreserve: number;
  timeoutSeconds: number;
  autoAddResultLayer: boolean;
}

export interface AosAiJob {
  id: string;
  provider: AosAiProvider;
  documentId: string;
  documentName: string;
  status: AosAiJobStatus;
  positivePrompt: string;
  negativePrompt: string;
  maskMode: AosAiMaskMode;
  mode: AosAiMode;
  referenceAssetId: string | null;
  referenceAssetName: string | null;
  workflowName: string;
  createdAt: string;
  completedAt: string | null;
  promptId: string | null;
  outputAssetId: string | null;
  error: string | null;
}

export interface AosProjectManifest {
  schemaVersion: typeof AOS_PROJECT_SCHEMA_VERSION;
  appVersion: string;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assets: {
    avatar: AosProjectAsset | null;
    references: AosProjectAsset[];
    templates: AosProjectAsset[];
    generated: AosProjectAsset[];
  };
  materialOverrides: AosMaterialOverride[];
  textureDocuments: AosTextureDocument[];
  aiSettings: AosAiSettings;
  aiJobs: AosAiJob[];
}

export interface AosRecentProject {
  path: string;
  name: string;
  updatedAt: string;
}

export interface NativeFilePayload {
  path: string;
  name: string;
  size: number;
  mimeType: string;
  data: Uint8Array;
}

export interface HydratedProjectPayload {
  path: string;
  manifest: AosProjectManifest;
  assets: {
    avatar: NativeFilePayload | null;
    references: NativeFilePayload[];
    templates: NativeFilePayload[];
    generated: NativeFilePayload[];
  };
  missingAssetPaths: string[];
}

export interface ComfyUiConnectionResult {
  ok: boolean;
  message: string;
  deviceName: string | null;
  vramTotal: number | null;
}

export interface ComfyUiRunRequest {
  projectId: string;
  documentId: string;
  endpoint: string;
  workflowJson: string;
  positivePrompt: string;
  negativePrompt: string;
  inputImage: Uint8Array;
  maskImage: Uint8Array;
  referenceImage: Uint8Array | null;
  mode: AosAiMode;
  referenceStrength: number;
  denoiseStrength: number;
  templatePreserve: number;
  outputPrefix: string;
  timeoutSeconds: number;
}

export interface ComfyUiRunResult {
  promptId: string;
  outputNodeId: string;
  output: NativeFilePayload;
}

export function textureDocumentAssetId(documentId: string): string {
  return `texture-document:${documentId}`;
}

export function createDefaultAiSettings(): AosAiSettings {
  return {
    provider: 'comfyui',
    endpoint: 'http://127.0.0.1:8188',
    workflowName: '',
    workflowJson: '',
    positivePrompt: 'high quality VRoid clothing texture, preserve UV layout, seamless garment details',
    negativePrompt: 'text, watermark, logo, extra objects, broken UV layout, cropped texture',
    maskMode: 'template-alpha',
    mode: 'prompt-only',
    referenceAssetId: null,
    referenceStrength: 0.7,
    denoiseStrength: 0.55,
    templatePreserve: 0.85,
    timeoutSeconds: 300,
    autoAddResultLayer: true,
  };
}

export function createProjectManifest(name = 'Untitled Project'): AosProjectManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: AOS_PROJECT_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    id: globalThis.crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    assets: {
      avatar: null,
      references: [],
      templates: [],
      generated: [],
    },
    materialOverrides: [],
    textureDocuments: [],
    aiSettings: createDefaultAiSettings(),
    aiJobs: [],
  };
}
