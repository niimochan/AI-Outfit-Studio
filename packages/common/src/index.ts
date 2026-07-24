export const APP_NAME = 'AI Outfit Studio';
export const APP_VERSION = '0.4.0';
export const AOS_PROJECT_SCHEMA_VERSION = 3;

export type AosAssetKind = 'avatar' | 'reference' | 'template';

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
  };
  materialOverrides: AosMaterialOverride[];
  textureDocuments: AosTextureDocument[];
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
  };
  missingAssetPaths: string[];
}

export function textureDocumentAssetId(documentId: string): string {
  return `texture-document:${documentId}`;
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
    },
    materialOverrides: [],
    textureDocuments: [],
  };
}
