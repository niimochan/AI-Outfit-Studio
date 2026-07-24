import { useCallback, useEffect, useRef } from 'react';
import { VrmStage, type VrmLoadResult, type VrmStageStats } from '@ai-outfit-studio/vrm-engine';

interface VrmViewportProps {
  selectedFile: File | null;
  command: 'fit' | 'reset' | null;
  commandId: number;
  onLoadStart: () => void;
  onProgress: (progress: number | null) => void;
  onLoaded: (result: VrmLoadResult) => void;
  onError: (message: string) => void;
  onStats: (stats: VrmStageStats) => void;
}

export function VrmViewport({
  selectedFile,
  command,
  commandId,
  onLoadStart,
  onProgress,
  onLoaded,
  onError,
  onStats,
}: VrmViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<VrmStage | null>(null);

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
