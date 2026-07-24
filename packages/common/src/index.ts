export const APP_NAME = 'AI Outfit Studio';
export const APP_VERSION = '0.3.1';
export const AOS_PROJECT_SCHEMA_VERSION = 2;

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
  };
}
