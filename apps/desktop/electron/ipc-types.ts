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
  schemaVersion: 3;
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
