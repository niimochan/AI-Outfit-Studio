import type { AosAssetKind, AosProjectAsset, NativeFilePayload } from '@ai-outfit-studio/common';

export interface RuntimeAsset {
  meta: AosProjectAsset;
  file: File;
  previewUrl: string | null;
}

function createAssetMeta(file: File, kind: AosAssetKind, sourcePath: string): AosProjectAsset {
  return {
    id: crypto.randomUUID(),
    kind,
    name: file.name,
    sourcePath,
    size: file.size,
    mimeType: file.type || (kind === 'avatar' ? 'model/gltf-binary' : 'application/octet-stream'),
    importedAt: new Date().toISOString(),
  };
}

export function runtimeAssetFromFile(file: File, kind: AosAssetKind, sourcePath: string): RuntimeAsset {
  const meta = createAssetMeta(file, kind, sourcePath);
  return {
    meta,
    file,
    previewUrl: kind === 'avatar' ? null : URL.createObjectURL(file),
  };
}

export function runtimeAssetFromPayload(
  payload: NativeFilePayload,
  kind: AosAssetKind,
  existingMeta?: AosProjectAsset,
): RuntimeAsset {
  const bytes = new Uint8Array(payload.data.byteLength);
  bytes.set(payload.data);
  const file = new File([bytes.buffer], payload.name, {
    type: payload.mimeType,
    lastModified: Date.now(),
  });
  return {
    meta: existingMeta ?? createAssetMeta(file, kind, payload.path),
    file,
    previewUrl: kind === 'avatar' ? null : URL.createObjectURL(file),
  };
}

export function disposeRuntimeAsset(asset: RuntimeAsset | null | undefined): void {
  if (asset?.previewUrl) {
    URL.revokeObjectURL(asset.previewUrl);
  }
}

export function disposeRuntimeAssets(assets: RuntimeAsset[]): void {
  for (const asset of assets) {
    disposeRuntimeAsset(asset);
  }
}
