import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VrmLoadResult, VrmStageStats } from '@ai-outfit-studio/vrm-engine';
import { APP_NAME, APP_VERSION } from '@ai-outfit-studio/common';
import { VrmViewport } from './components/VrmViewport';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type CameraCommand = 'fit' | 'reset' | null;

const initialStats: VrmStageStats = {
  fps: 0,
  triangles: 0,
  drawCalls: 0,
  geometries: 0,
  textures: 0,
};

export function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadResult, setLoadResult] = useState<VrmLoadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<VrmStageStats>(initialStats);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>(null);
  const [cameraCommandId, setCameraCommandId] = useState(0);
  const [electronVersion, setElectronVersion] = useState<string>('web-preview');

  const issueCameraCommand = useCallback((command: Exclude<CameraCommand, null>) => {
    setCameraCommand(command);
    setCameraCommandId((value) => value + 1);
  }, []);

  const acceptFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.vrm')) {
      setLoadState('error');
      setErrorMessage('拡張子 .vrm のファイルを選択してください。');
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setLoadResult(null);
  }, []);

  const handleLoadStart = useCallback(() => {
    setLoadState('loading');
    setProgress(null);
    setErrorMessage(null);
  }, []);

  const handleProgress = useCallback((value: number | null) => {
    setProgress(value);
  }, []);

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

  const handleStats = useCallback((nextStats: VrmStageStats) => {
    setStats(nextStats);
  }, []);

  useEffect(() => {
    void window.aosDesktop?.getAppVersion().then(setElectronVersion);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const handleDropEvent = (event: Event) => {
      const customEvent = event as CustomEvent<File>;
      acceptFile(customEvent.detail);
    };

    shell.addEventListener('aos-vrm-drop', handleDropEvent);
    return () => shell.removeEventListener('aos-vrm-drop', handleDropEvent);
  }, [acceptFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'f') {
        issueCameraCommand('fit');
      }
      if (event.key.toLowerCase() === 'r') {
        issueCameraCommand('reset');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [issueCameraCommand]);

  const statusLabel = useMemo(() => {
    switch (loadState) {
      case 'loading':
        return progress === null ? '読み込み中' : `読み込み中 ${Math.round(progress * 100)}%`;
      case 'ready':
        return '表示準備完了';
      case 'error':
        return 'エラー';
      default:
        return 'VRM未選択';
    }
  }, [loadState, progress]);

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
        <div className="topbar-status">
          <span className={`status-dot status-${loadState}`} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <aside className="sidebar left-sidebar">
        <section className="panel-section">
          <div className="section-heading">
            <span>PROJECT</span>
            <small>Foundation</small>
          </div>
          <button className="primary-button" type="button" onClick={() => inputRef.current?.click()}>
            VRMを読み込む
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept=".vrm,model/gltf-binary,application/octet-stream"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                acceptFile(file);
              }
              event.currentTarget.value = '';
            }}
          />
          <button
            className="secondary-button"
            type="button"
            disabled={loadState !== 'ready'}
            onClick={() => issueCameraCommand('fit')}
          >
            全身を表示 <kbd>F</kbd>
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => issueCameraCommand('reset')}
          >
            カメラをリセット <kbd>R</kbd>
          </button>
        </section>

        <section className="panel-section asset-list">
          <div className="section-heading">
            <span>ASSETS</span>
          </div>
          <div className={`asset-row ${selectedFile ? 'active' : ''}`}>
            <span className="asset-icon">3D</span>
            <div>
              <strong>Avatar</strong>
              <small>{selectedFile?.name ?? 'No VRM selected'}</small>
            </div>
          </div>
          <div className="asset-row disabled">
            <span className="asset-icon">IMG</span>
            <div>
              <strong>Reference</strong>
              <small>Sprint 02</small>
            </div>
          </div>
          <div className="asset-row disabled">
            <span className="asset-icon">UV</span>
            <div>
              <strong>Templates</strong>
              <small>Sprint 02</small>
            </div>
          </div>
        </section>
      </aside>

      <main className="workspace">
        <VrmViewport
          selectedFile={selectedFile}
          command={cameraCommand}
          commandId={cameraCommandId}
          onLoadStart={handleLoadStart}
          onProgress={handleProgress}
          onLoaded={handleLoaded}
          onError={handleError}
          onStats={handleStats}
        />
        {loadState === 'loading' && (
          <div className="loading-card">
            <div className="spinner" />
            <strong>VRMを解析しています</strong>
            <span>{progress === null ? 'ファイルを展開中…' : `${Math.round(progress * 100)}%`}</span>
          </div>
        )}
        {errorMessage && (
          <div className="error-card" role="alert">
            <strong>読み込みエラー</strong>
            <span>{errorMessage}</span>
          </div>
        )}
      </main>

      <aside className="sidebar right-sidebar">
        <section className="panel-section">
          <div className="section-heading">
            <span>INSPECTOR</span>
          </div>
          <dl className="inspector-grid">
            <dt>File</dt>
            <dd title={selectedFile?.name}>{selectedFile?.name ?? '—'}</dd>
            <dt>Size</dt>
            <dd>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : '—'}</dd>
            <dt>Format</dt>
            <dd>{loadResult?.specVersion ?? '—'}</dd>
            <dt>Height</dt>
            <dd>{loadResult ? `${loadResult.height.toFixed(3)} m` : '—'}</dd>
            <dt>Objects</dt>
            <dd>{loadResult?.objectCount ?? '—'}</dd>
          </dl>
        </section>

        <section className="panel-section debug-panel">
          <div className="section-heading">
            <span>DEBUG</span>
            <small>Realtime</small>
          </div>
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
          <p><b>左ドラッグ</b> 回転</p>
          <p><b>ホイール</b> ズーム</p>
          <p><b>右ドラッグ</b> パン</p>
        </section>
      </aside>

      <footer className="statusbar">
        <span>{APP_NAME} v{APP_VERSION}</span>
        <span>Electron {electronVersion}</span>
        <span>{window.aosDesktop?.platform ?? navigator.platform}</span>
      </footer>
    </div>
  );
}
