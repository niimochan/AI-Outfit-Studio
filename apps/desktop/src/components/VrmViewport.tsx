import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AosMaterialOverride } from '@ai-outfit-studio/common';
import { VrmStage, type VrmLoadResult, type VrmStageStats } from '@ai-outfit-studio/vrm-engine';

interface TextureAssetInput {
  id: string;
  file: File;
}

interface VrmViewportProps {
  selectedFile: File | null;
  materialOverrides: AosMaterialOverride[];
  textureAssets: TextureAssetInput[];
  command: 'fit' | 'reset' | null;
  commandId: number;
  onLoadStart: () => void;
  onProgress: (progress: number | null) => void;
  onLoaded: (result: VrmLoadResult) => void;
  onError: (message: string) => void;
  onStats: (stats: VrmStageStats) => void;
  onMaterialError: (message: string) => void;
}

export function VrmViewport({
  selectedFile,
  materialOverrides,
  textureAssets,
  command,
  commandId,
  onLoadStart,
  onProgress,
  onLoaded,
  onError,
  onStats,
  onMaterialError,
}: VrmViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<VrmStage | null>(null);
  const [modelRevision, setModelRevision] = useState(0);

  const textureAssetMap = useMemo(
    () => new Map(textureAssets.map((asset) => [asset.id, asset.file])),
    [textureAssets],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const stage = new VrmStage(host, {
      onStats,
    });
    stageRef.current = stage;

    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, [onStats]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }
    if (!selectedFile) {
      stage.clearModel();
      setModelRevision((value) => value + 1);
      return;
    }

    let cancelled = false;
    onLoadStart();

    void stage
      .loadFile(selectedFile, (progress) => {
        if (!cancelled) {
          onProgress(progress);
        }
      })
      .then((result) => {
        if (!cancelled) {
          onLoaded(result);
          setModelRevision((value) => value + 1);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : 'VRMの読み込みに失敗しました。';
        onError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, onError, onLoadStart, onLoaded, onProgress]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !selectedFile || modelRevision === 0) {
      return;
    }

    let cancelled = false;
    void stage
      .applyMaterialOverrides(
        materialOverrides,
        (assetId) => textureAssetMap.get(assetId) ?? null,
      )
      .catch((error: unknown) => {
        if (!cancelled) {
          onMaterialError(error instanceof Error ? error.message : 'マテリアルの更新に失敗しました。');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [materialOverrides, modelRevision, onMaterialError, selectedFile, textureAssetMap]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !command) {
      return;
    }

    if (command === 'fit') {
      stage.fitCameraToModel();
    } else {
      stage.resetCamera();
    }
  }, [command, commandId]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      event.currentTarget.dispatchEvent(
        new CustomEvent<File[]>('aos-files-drop', {
          bubbles: true,
          detail: files,
        }),
      );
    }
  }, []);

  return (
    <div
      ref={hostRef}
      className="viewport-host"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      aria-label="VRM 3D viewport"
    >
      <div className="viewport-hint">
        <strong>VRM Viewport</strong>
        <span>VRMまたは参考画像をここへドロップ</span>
      </div>
    </div>
  );
}
