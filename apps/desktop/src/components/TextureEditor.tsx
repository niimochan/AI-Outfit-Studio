import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AosAiJob,
  AosAiSettings,
  AosReferencePrepSettings,
  AosTextureBlendMode,
  AosTextureDocument,
  AosTextureLayer,
} from '@ai-outfit-studio/common';
import {
  canvasToPngBlob,
  createDefaultTextureLayer,
  extractReferenceImage,
  fitTextureLayer,
  renderTextureDocument,
  type TextureFitMode,
  type TextureSourceAsset,
} from '../texture/texture-renderer';

type EditorTool = 'move' | 'eraser' | 'pan';

interface TextureEditorProps {
  document: AosTextureDocument;
  assets: TextureSourceAsset[];
  referenceAssets: TextureSourceAsset[];
  onPrepareReference: (
    document: AosTextureDocument,
    sourceAssetId: string,
    settings: AosReferencePrepSettings,
  ) => Promise<string | null>;
  onChange: (document: AosTextureDocument) => void;
  onExport: (document: AosTextureDocument) => void;
  onShow3d: () => void;
  aiSettings: AosAiSettings;
  aiJobs: AosAiJob[];
  onAiSettingsChange: (settings: AosAiSettings) => void;
  onRunAi: (document: AosTextureDocument, selectedLayerId: string | null) => Promise<void>;
}

interface PointerSession {
  mode: EditorTool;
  pointerId: number;
  clientX: number;
  clientY: number;
  documentX: number;
  documentY: number;
  layerX: number;
  layerY: number;
  before: AosTextureDocument;
  changed: boolean;
}

function cloneDocument(document: AosTextureDocument): AosTextureDocument {
  return structuredClone(document);
}

function replaceLayer(document: AosTextureDocument, layerId: string, patch: Partial<AosTextureLayer>): AosTextureDocument {
  return {
    ...document,
    updatedAt: new Date().toISOString(),
    layers: document.layers.map((layer) => layer.id === layerId ? { ...layer, ...patch } : layer),
  };
}

export function TextureEditor({ document, assets, referenceAssets, onPrepareReference, onChange, onExport, onShow3d, aiSettings, aiJobs, onAiSettingsChange, onRunAi }: TextureEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(document);
  const committedRef = useRef(document);
  const pastRef = useRef<AosTextureDocument[]>([]);
  const futureRef = useRef<AosTextureDocument[]>([]);
  const pointerRef = useRef<PointerSession | null>(null);
  const renderGenerationRef = useRef(0);

  const [draft, setDraft] = useState(document);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(document.layers.at(-1)?.id ?? null);
  const [tool, setTool] = useState<EditorTool>('move');
  const [zoom, setZoom] = useState(0.2);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [eraserRadius, setEraserRadius] = useState(48);
  const [addAssetId, setAddAssetId] = useState(assets.find((asset) => asset.id !== document.templateAssetId)?.id ?? '');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [referencePrepRunning, setReferencePrepRunning] = useState(false);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [referencePreviewError, setReferencePreviewError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<{ tone: 'idle' | 'ok' | 'error'; message: string }>({ tone: 'idle', message: '未確認' });
  const [, forceHistoryRevision] = useState(0);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const selectedLayer = useMemo(
    () => draft.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [draft.layers, selectedLayerId],
  );
  const selectedReferenceAsset = useMemo(
    () => referenceAssets.find((asset) => asset.id === aiSettings.referenceAssetId) ?? null,
    [aiSettings.referenceAssetId, referenceAssets],
  );

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    const timer = window.setTimeout(() => {
      if (!selectedReferenceAsset) {
        setReferencePreviewUrl(null);
        setReferencePreviewError(null);
        return;
      }
      setReferencePreviewError(null);
      void extractReferenceImage(selectedReferenceAsset.file, aiSettings.referencePrep)
        .then(canvasToPngBlob)
        .then((blob) => {
          if (disposed) return;
          objectUrl = URL.createObjectURL(blob);
          setReferencePreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return objectUrl;
          });
        })
        .catch((error: unknown) => {
          if (!disposed) {
            setReferencePreviewError(error instanceof Error ? error.message : '抽出プレビューを生成できませんでした。');
          }
        });
    }, 180);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [aiSettings.referencePrep, selectedReferenceAsset]);

  const setDraftSafe = useCallback((next: AosTextureDocument) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const commit = useCallback((next: AosTextureDocument, before = committedRef.current) => {
    const normalized = { ...next, updatedAt: new Date().toISOString() };
    pastRef.current.push(cloneDocument(before));
    if (pastRef.current.length > 60) pastRef.current.shift();
    futureRef.current = [];
    committedRef.current = normalized;
    setDraftSafe(normalized);
    onChange(normalized);
    forceHistoryRevision((value) => value + 1);
  }, [onChange, setDraftSafe]);

  const applyWithoutHistory = useCallback((next: AosTextureDocument) => {
    committedRef.current = next;
    setDraftSafe(next);
    onChange(next);
    forceHistoryRevision((value) => value + 1);
  }, [onChange, setDraftSafe]);

  useEffect(() => {
    if (document.id !== committedRef.current.id) {
      pastRef.current = [];
      futureRef.current = [];
      committedRef.current = document;
      setDraftSafe(document);
      setSelectedLayerId(document.layers.at(-1)?.id ?? null);
      setPan({ x: 0, y: 0 });
      forceHistoryRevision((value) => value + 1);
      return;
    }
    if (document.updatedAt !== committedRef.current.updatedAt && !pointerRef.current) {
      const addedLayer = document.layers.length > committedRef.current.layers.length ? document.layers.at(-1) : null;
      committedRef.current = document;
      setDraftSafe(document);
      if (addedLayer) setSelectedLayerId(addedLayer.id);
    }
  }, [document, setDraftSafe]);

  const fitCanvas = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const availableWidth = Math.max(120, host.clientWidth - 90);
    const availableHeight = Math.max(120, host.clientHeight - 90);
    setZoom(Math.min(1, availableWidth / draft.width, availableHeight / draft.height));
    setPan({ x: 0, y: 0 });
  }, [draft.height, draft.width]);

  useEffect(() => {
    fitCanvas();
  }, [document.id, fitCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const generation = ++renderGenerationRef.current;
    setRendering(true);
    setRenderError(null);
    void renderTextureDocument(draft, assetMap, canvas)
      .catch((error: unknown) => {
        if (generation === renderGenerationRef.current) {
          setRenderError(error instanceof Error ? error.message : 'テクスチャを描画できませんでした。');
        }
      })
      .finally(() => {
        if (generation === renderGenerationRef.current) setRendering(false);
      });
  }, [assetMap, draft]);

  const canvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * draftRef.current.width,
      y: ((event.clientY - rect.top) / rect.height) * draftRef.current.height,
    };
  }, []);

  const addEraserPoint = useCallback((x: number, y: number) => {
    const layerId = selectedLayerId;
    if (!layerId) return;
    const current = draftRef.current;
    const next = replaceLayer(current, layerId, {
      eraserStrokes: [
        ...(current.layers.find((layer) => layer.id === layerId)?.eraserStrokes ?? []),
        { id: crypto.randomUUID(), x, y, radius: eraserRadius },
      ],
    });
    setDraftSafe(next);
  }, [eraserRadius, selectedLayerId, setDraftSafe]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = canvasPoint(event);
    const effectiveTool: EditorTool = event.button === 1 ? 'pan' : tool;
    pointerRef.current = {
      mode: effectiveTool,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      documentX: point.x,
      documentY: point.y,
      layerX: selectedLayer?.x ?? 0,
      layerY: selectedLayer?.y ?? 0,
      before: cloneDocument(committedRef.current),
      changed: false,
    };
    if (effectiveTool === 'eraser' && selectedLayer) {
      addEraserPoint(point.x, point.y);
      if (pointerRef.current) pointerRef.current.changed = true;
    }
  }, [addEraserPoint, canvasPoint, selectedLayer, tool]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    if (session.mode === 'pan') {
      const dx = event.clientX - session.clientX;
      const dy = event.clientY - session.clientY;
      session.clientX = event.clientX;
      session.clientY = event.clientY;
      setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
      return;
    }
    if (!selectedLayerId) return;
    const point = canvasPoint(event);
    if (session.mode === 'move') {
      const next = replaceLayer(draftRef.current, selectedLayerId, {
        x: session.layerX + (point.x - session.documentX),
        y: session.layerY + (point.y - session.documentY),
      });
      setDraftSafe(next);
      session.changed = true;
    } else if (session.mode === 'eraser') {
      addEraserPoint(point.x, point.y);
      session.changed = true;
    }
  }, [addEraserPoint, canvasPoint, selectedLayerId, setDraftSafe]);

  const finishPointer = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    pointerRef.current = null;
    if (session.mode !== 'pan' && session.changed) {
      commit(draftRef.current, session.before);
    }
  }, [commit]);

  const undo = useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    futureRef.current.push(cloneDocument(committedRef.current));
    applyWithoutHistory(previous);
  }, [applyWithoutHistory]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneDocument(committedRef.current));
    applyWithoutHistory(next);
  }, [applyWithoutHistory]);

  const addLayer = useCallback(async () => {
    const source = assetMap.get(addAssetId);
    if (!source) return;
    const layer = await createDefaultTextureLayer(source, draft.width, draft.height);
    const next = {
      ...draft,
      updatedAt: new Date().toISOString(),
      layers: [...draft.layers, layer],
    };
    setSelectedLayerId(layer.id);
    commit(next);
  }, [addAssetId, assetMap, commit, draft]);


  const autoFitSelectedLayer = useCallback(async (mode: TextureFitMode) => {
    if (!selectedLayer) return;
    const source = assetMap.get(selectedLayer.sourceAssetId);
    if (!source) return;
    const fitted = await fitTextureLayer(selectedLayer, source, draft.width, draft.height, mode);
    commit(replaceLayer(draft, selectedLayer.id, fitted));
  }, [assetMap, commit, draft, selectedLayer]);

  const pickWorkflow = useCallback(async () => {
    const picked = await window.aosDesktop?.pickWorkflowJson();
    if (!picked) return;
    onAiSettingsChange({ ...aiSettings, workflowName: picked.name, workflowJson: picked.json });
    setConnectionState({ tone: 'idle', message: 'Workflow読込済み' });
  }, [aiSettings, onAiSettingsChange]);

  const testConnection = useCallback(async () => {
    if (!window.aosDesktop) {
      setConnectionState({ tone: 'error', message: 'デスクトップ版が必要です。' });
      return;
    }
    setConnectionState({ tone: 'idle', message: '接続確認中…' });
    const result = await window.aosDesktop.testComfyUi(aiSettings.endpoint);
    setConnectionState({ tone: result.ok ? 'ok' : 'error', message: result.message });
  }, [aiSettings.endpoint]);

  const executeAi = useCallback(async () => {
    setAiRunning(true);
    try {
      await onRunAi(draft, selectedLayerId);
    } finally {
      setAiRunning(false);
    }
  }, [draft, onRunAi, selectedLayerId]);

  const prepareReference = useCallback(async () => {
    if (!selectedReferenceAsset) return;
    setReferencePrepRunning(true);
    try {
      const preparedAssetId = await onPrepareReference(draft, selectedReferenceAsset.id, aiSettings.referencePrep);
      if (preparedAssetId) {
        onAiSettingsChange({
          ...aiSettings,
          mode: aiSettings.mode === 'prompt-only' ? 'reference-guided' : aiSettings.mode,
          referenceAssetId: preparedAssetId,
        });
      }
    } finally {
      setReferencePrepRunning(false);
    }
  }, [aiSettings, draft, onAiSettingsChange, onPrepareReference, selectedReferenceAsset]);

  const documentJobs = useMemo(
    () => aiJobs.filter((job) => job.documentId === draft.id).slice(-6).reverse(),
    [aiJobs, draft.id],
  );

  const changeSelectedLayer = useCallback((patch: Partial<AosTextureLayer>) => {
    if (!selectedLayerId) return;
    commit(replaceLayer(draft, selectedLayerId, patch));
  }, [commit, draft, selectedLayerId]);

  const deleteSelectedLayer = useCallback(() => {
    if (!selectedLayerId) return;
    const index = draft.layers.findIndex((layer) => layer.id === selectedLayerId);
    const nextLayers = draft.layers.filter((layer) => layer.id !== selectedLayerId);
    setSelectedLayerId(nextLayers[Math.min(index, nextLayers.length - 1)]?.id ?? null);
    commit({ ...draft, layers: nextLayers, updatedAt: new Date().toISOString() });
  }, [commit, draft, selectedLayerId]);

  const moveLayer = useCallback((direction: -1 | 1) => {
    if (!selectedLayerId) return;
    const index = draft.layers.findIndex((layer) => layer.id === selectedLayerId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.layers.length) return;
    const layers = [...draft.layers];
    const [layer] = layers.splice(index, 1);
    layers.splice(target, 0, layer!);
    commit({ ...draft, layers, updatedAt: new Date().toISOString() });
  }, [commit, draft, selectedLayerId]);

  const updateDocument = useCallback((patch: Partial<AosTextureDocument>) => {
    commit({ ...draft, ...patch, updatedAt: new Date().toISOString() });
  }, [commit, draft]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  const blendModes: Array<{ value: AosTextureBlendMode; label: string }> = [
    { value: 'source-over', label: '通常' },
    { value: 'multiply', label: '乗算' },
    { value: 'screen', label: 'スクリーン' },
    { value: 'overlay', label: 'オーバーレイ' },
  ];

  return (
    <div className="texture-editor-root">
      <div className="texture-toolbar">
        <button type="button" className={tool === 'move' ? 'active' : ''} onClick={() => setTool('move')}>移動</button>
        <button type="button" className={tool === 'eraser' ? 'active' : ''} disabled={!selectedLayer} onClick={() => setTool('eraser')}>消しゴム</button>
        <button type="button" className={tool === 'pan' ? 'active' : ''} onClick={() => setTool('pan')}>パン</button>
        <span className="toolbar-separator" />
        <button type="button" disabled={pastRef.current.length === 0} onClick={undo}>Undo</button>
        <button type="button" disabled={futureRef.current.length === 0} onClick={redo}>Redo</button>
        <span className="toolbar-separator" />
        <button type="button" onClick={() => setZoom((value) => Math.max(0.02, value / 1.2))}>−</button>
        <button type="button" onClick={fitCanvas}>{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoom((value) => Math.min(4, value * 1.2))}>＋</button>
        <span className="toolbar-spacer" />
        <button type="button" onClick={onShow3d}>3D表示</button>
        <button type="button" className="export-button" onClick={() => onExport(draft)}>PNG書き出し</button>
      </div>

      <div ref={hostRef} className={`texture-canvas-host tool-${tool}`} onWheel={(event) => {
        event.preventDefault();
        setZoom((value) => Math.min(4, Math.max(0.02, value * (event.deltaY > 0 ? 0.9 : 1.1))));
      }}>
        <div className="texture-stage" style={{ transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          <canvas
            ref={canvasRef}
            className="texture-canvas checkerboard"
            width={draft.width}
            height={draft.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
          />
        </div>
        <div className="texture-canvas-info">
          <strong>{draft.name}</strong>
          <span>{draft.width} × {draft.height}px · {draft.layers.length} layers</span>
          {rendering && <b>Rendering…</b>}
          {renderError && <em>{renderError}</em>}
        </div>
        {tool === 'eraser' && <div className="eraser-size-card">消しゴム {eraserRadius}px</div>}
      </div>

      <aside className="texture-layers-panel">
        <div className="texture-panel-heading"><span>LAYERS</span><small>{draft.layers.length + 1}</small></div>
        <div className="add-layer-row">
          <select value={addAssetId} onChange={(event) => setAddAssetId(event.target.value)}>
            <option value="">画像を選択</option>
            {assets.filter((asset) => asset.id !== draft.templateAssetId).map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
          </select>
          <button type="button" disabled={!addAssetId} onClick={() => void addLayer()}>追加</button>
        </div>

        <div className="texture-layer-list">
          {[...draft.layers].reverse().map((layer) => {
            const source = assetMap.get(layer.sourceAssetId);
            return (
              <div className={`texture-layer-row ${selectedLayerId === layer.id ? 'active' : ''}`} key={layer.id}>
                <button type="button" className="layer-visibility" title="表示/非表示" onClick={() => {
                  setSelectedLayerId(layer.id);
                  commit(replaceLayer(draft, layer.id, { visible: !layer.visible }));
                }}>{layer.visible ? '●' : '○'}</button>
                <button type="button" className="layer-main" onClick={() => setSelectedLayerId(layer.id)}>
                  {source?.previewUrl ? <img src={source.previewUrl} alt="" /> : <span>IMG</span>}
                  <span><strong>{layer.name}</strong><small>{Math.round(layer.opacity * 100)}% · {blendModes.find((mode) => mode.value === layer.blendMode)?.label}</small></span>
                </button>
              </div>
            );
          })}
          <div className="texture-layer-row base-layer">
            <button type="button" className="layer-visibility" onClick={() => updateDocument({ showTemplateBase: !draft.showTemplateBase })}>{draft.showTemplateBase ? '●' : '○'}</button>
            <div className="layer-main">
              {assetMap.get(draft.templateAssetId)?.previewUrl ? <img src={assetMap.get(draft.templateAssetId)?.previewUrl ?? ''} alt="" /> : <span>UV</span>}
              <span><strong>Template Base</strong><small>Locked</small></span>
            </div>
          </div>
        </div>

        {selectedLayer && (
          <div className="texture-layer-controls">
            <label><span>レイヤー名</span><input value={selectedLayer.name} onChange={(event) => changeSelectedLayer({ name: event.target.value })} /></label>
            <label><span>不透明度 {Math.round(selectedLayer.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={selectedLayer.opacity} onChange={(event) => changeSelectedLayer({ opacity: Number(event.target.value) })} /></label>
            <label><span>合成</span><select value={selectedLayer.blendMode} onChange={(event) => changeSelectedLayer({ blendMode: event.target.value as AosTextureBlendMode })}>{blendModes.map((mode) => <option value={mode.value} key={mode.value}>{mode.label}</option>)}</select></label>
            <div className="transform-grid">
              <label><span>X</span><input type="number" value={Math.round(selectedLayer.x)} onChange={(event) => changeSelectedLayer({ x: Number(event.target.value) || 0 })} /></label>
              <label><span>Y</span><input type="number" value={Math.round(selectedLayer.y)} onChange={(event) => changeSelectedLayer({ y: Number(event.target.value) || 0 })} /></label>
              <label><span>Scale X</span><input type="number" min="0.01" step="0.05" value={Number(selectedLayer.scaleX.toFixed(3))} onChange={(event) => changeSelectedLayer({ scaleX: Math.max(0.01, Number(event.target.value) || 0.01) })} /></label>
              <label><span>Scale Y</span><input type="number" min="0.01" step="0.05" value={Number(selectedLayer.scaleY.toFixed(3))} onChange={(event) => changeSelectedLayer({ scaleY: Math.max(0.01, Number(event.target.value) || 0.01) })} /></label>
              <label><span>回転</span><input type="number" step="1" value={Number(selectedLayer.rotation.toFixed(1))} onChange={(event) => changeSelectedLayer({ rotation: Number(event.target.value) || 0 })} /></label>
              <label><span>消しゴム</span><input type="number" min="1" max="512" value={eraserRadius} onChange={(event) => setEraserRadius(Math.min(512, Math.max(1, Number(event.target.value) || 1)))} /></label>
            </div>
            <div className="auto-fit-block">
              <span>自動フィット</span>
              <div className="auto-fit-grid">
                <button type="button" onClick={() => void autoFitSelectedLayer('contain')}>内接</button>
                <button type="button" onClick={() => void autoFitSelectedLayer('cover')}>全面</button>
                <button type="button" onClick={() => void autoFitSelectedLayer('stretch')}>引き伸ばし</button>
                <button type="button" onClick={() => void autoFitSelectedLayer('original')}>原寸・中央</button>
              </div>
            </div>
            <div className="layer-action-grid">
              <button type="button" onClick={() => moveLayer(1)}>前面へ</button>
              <button type="button" onClick={() => moveLayer(-1)}>背面へ</button>
              <button type="button" disabled={selectedLayer.eraserStrokes.length === 0} onClick={() => changeSelectedLayer({ eraserStrokes: [] })}>消去を解除</button>
              <button type="button" className="danger-button" onClick={deleteSelectedLayer}>削除</button>
            </div>
          </div>
        )}

        <div className="texture-document-options">
          <label><input type="checkbox" checked={draft.maskToTemplateAlpha} onChange={(event) => updateDocument({ maskToTemplateAlpha: event.target.checked })} />テンプレートのAlphaでマスク</label>
          <label><input type="checkbox" checked={draft.showTemplateBase} onChange={(event) => updateDocument({ showTemplateBase: event.target.checked })} />テンプレートをベース表示</label>
        </div>

        <div className="ai-assist-panel">
          <div className="texture-panel-heading"><span>AI ASSIST</span><small>ComfyUI</small></div>

          <div className="ai-section-block">
            <div className="ai-section-title">SOURCE</div>
            <label className="ai-field"><span>接続先</span><input value={aiSettings.endpoint} onChange={(event) => onAiSettingsChange({ ...aiSettings, endpoint: event.target.value })} /></label>
            <div className="ai-inline-actions">
              <button type="button" onClick={() => void testConnection()}>接続テスト</button>
              <button type="button" onClick={() => void pickWorkflow()}>Workflow読込</button>
            </div>
            <p className={`ai-connection-state ${connectionState.tone}`}>{connectionState.message}</p>
            <div className="workflow-card">
              <strong>{aiSettings.workflowName || 'Workflow未設定'}</strong>
              <small>{aiSettings.workflowJson ? `${aiSettings.workflowJson.length.toLocaleString()} chars` : 'ComfyUIのAPI形式JSONを読み込んでください'}</small>
            </div>
            <div className="ai-two-column">
              <label className="ai-field"><span>生成モード</span><select value={aiSettings.mode} onChange={(event) => onAiSettingsChange({ ...aiSettings, mode: event.target.value as AosAiSettings['mode'] })}>
                <option value="prompt-only">Prompt Only</option>
                <option value="reference-guided">Reference Guided</option>
                <option value="reference-inpaint">Reference + Inpaint</option>
              </select></label>
              <label className="ai-field"><span>参照画像</span><select value={aiSettings.referenceAssetId ?? ''} onChange={(event) => onAiSettingsChange({ ...aiSettings, referenceAssetId: event.target.value || null })}>
                <option value="">なし</option>
                {referenceAssets.map((asset) => <option value={asset.id} key={asset.id}>{asset.name}</option>)}
              </select></label>
            </div>
            {selectedReferenceAsset && <div className="ai-reference-card">
              {selectedReferenceAsset.previewUrl ? <img src={selectedReferenceAsset.previewUrl} alt="reference preview" /> : <span>REF</span>}
              <div>
                <strong>{selectedReferenceAsset.name}</strong>
                <small>{aiSettings.mode === 'prompt-only' ? '現在はPrompt Onlyのため参考画像は送信されません。' : '選択した参考画像はComfyUIへ送信されます。抽出レイヤーと同じ画像を選んでいても、AI入力キャンバスには自動で含めません。'}</small>
              </div>
            </div>}
          </div>

          <div className="ai-section-block reference-prep-section">
            <div className="ai-section-title">REFERENCE PREP</div>
            <div className="ai-two-column">
              <label className="ai-field"><span>背景抽出</span><select value={aiSettings.referencePrep.extractMode} onChange={(event) => onAiSettingsChange({ ...aiSettings, referencePrep: { ...aiSettings.referencePrep, extractMode: event.target.value as AosReferencePrepSettings['extractMode'] } })}>
                <option value="auto-corners">四隅から自動判定</option>
                <option value="white-background">白背景を除去</option>
                <option value="black-background">黒背景を除去</option>
                <option value="alpha-only">既存Alphaのみ</option>
              </select></label>
              <label className="ai-field"><span>自動フィット</span><select value={aiSettings.referencePrep.fitMode} onChange={(event) => onAiSettingsChange({ ...aiSettings, referencePrep: { ...aiSettings.referencePrep, fitMode: event.target.value as AosReferencePrepSettings['fitMode'] } })}>
                <option value="template-bounds">テンプレートAlpha範囲</option>
                <option value="contain">キャンバスへ内接</option>
                <option value="cover">キャンバス全面</option>
              </select></label>
            </div>
            <label className="ai-field"><span>背景判定しきい値 {Math.round(aiSettings.referencePrep.threshold * 100)}%</span><input type="range" min="0" max="0.5" step="0.01" value={aiSettings.referencePrep.threshold} onChange={(event) => onAiSettingsChange({ ...aiSettings, referencePrep: { ...aiSettings.referencePrep, threshold: Number(event.target.value) } })} /></label>
            <label className="ai-field"><span>境界フェザー {Math.round(aiSettings.referencePrep.feather * 100)}%</span><input type="range" min="0" max="0.4" step="0.01" value={aiSettings.referencePrep.feather} onChange={(event) => onAiSettingsChange({ ...aiSettings, referencePrep: { ...aiSettings.referencePrep, feather: Number(event.target.value) } })} /></label>
            <label className="ai-field"><span>テンプレート余白 {Math.round(aiSettings.referencePrep.padding * 100)}%</span><input type="range" min="0" max="0.3" step="0.01" value={aiSettings.referencePrep.padding} onChange={(event) => onAiSettingsChange({ ...aiSettings, referencePrep: { ...aiSettings.referencePrep, padding: Number(event.target.value) } })} /></label>
            {selectedReferenceAsset ? <div className="reference-prep-preview-grid">
              <figure><figcaption>Original</figcaption>{selectedReferenceAsset.previewUrl ? <img src={selectedReferenceAsset.previewUrl} alt="original reference" /> : <span>REF</span>}</figure>
              <figure><figcaption>Extracted</figcaption>{referencePreviewUrl ? <img className="checkerboard" src={referencePreviewUrl} alt="extracted reference" /> : <span className="checkerboard">{referencePreviewError ?? 'Preview…'}</span>}</figure>
            </div> : <p className="reference-prep-empty">SOURCEで参考画像を選択すると、背景除去プレビューが表示されます。</p>}
            <button type="button" className="reference-prep-button" disabled={!selectedReferenceAsset || referencePrepRunning} onClick={() => void prepareReference()}>{referencePrepRunning ? '抽出・自動フィット中…' : '背景除去して自動フィット'}</button>
            <p className="ai-token-help">抽出結果は新規レイヤーとAI GENERATEDへ追加され、Reference Guidedの参照画像として自動選択されます。</p>
          </div>

          <div className="ai-section-block">
            <div className="ai-section-title">GENERATION</div>
            <label className="ai-field"><span>Positive Prompt</span><textarea rows={4} value={aiSettings.positivePrompt} onChange={(event) => onAiSettingsChange({ ...aiSettings, positivePrompt: event.target.value })} /></label>
            <label className="ai-field"><span>Negative Prompt</span><textarea rows={3} value={aiSettings.negativePrompt} onChange={(event) => onAiSettingsChange({ ...aiSettings, negativePrompt: event.target.value })} /></label>
            <div className="ai-three-column">
              <label className="ai-field"><span>参照強度 {Math.round(aiSettings.referenceStrength * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={aiSettings.referenceStrength} onChange={(event) => onAiSettingsChange({ ...aiSettings, referenceStrength: Number(event.target.value) })} /></label>
              <label className="ai-field"><span>Denoise {Math.round(aiSettings.denoiseStrength * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={aiSettings.denoiseStrength} onChange={(event) => onAiSettingsChange({ ...aiSettings, denoiseStrength: Number(event.target.value) })} /></label>
              <label className="ai-field"><span>テンプレ保持 {Math.round(aiSettings.templatePreserve * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={aiSettings.templatePreserve} onChange={(event) => onAiSettingsChange({ ...aiSettings, templatePreserve: Number(event.target.value) })} /></label>
            </div>
            <div className="ai-two-column">
              <label className="ai-field"><span>AI編集範囲</span><select value={aiSettings.maskMode} onChange={(event) => onAiSettingsChange({ ...aiSettings, maskMode: event.target.value as AosAiSettings['maskMode'] })}>
                <option value="template-alpha">テンプレートAlpha全体</option>
                <option value="selected-layer-eraser">選択レイヤーの消去部分</option>
                <option value="full-canvas">キャンバス全体</option>
              </select></label>
              <label className="ai-field"><span>Timeout (sec)</span><input type="number" min="30" max="3600" step="30" value={aiSettings.timeoutSeconds} onChange={(event) => onAiSettingsChange({ ...aiSettings, timeoutSeconds: Math.min(3600, Math.max(30, Number(event.target.value) || 300)) })} /></label>
            </div>
            <label className="ai-check"><input type="checkbox" checked={aiSettings.autoAddResultLayer} onChange={(event) => onAiSettingsChange({ ...aiSettings, autoAddResultLayer: event.target.checked })} />生成結果を新規レイヤーへ自動追加</label>
          </div>

          <div className="ai-section-block">
            <div className="ai-section-title">EXECUTION PREVIEW</div>
            <div className="ai-preview-list">
              <div className="ai-preview-item"><strong>Input</strong><small>{draft.name}</small></div>
              <div className="ai-preview-item"><strong>Input Policy</strong><small>{aiSettings.mode === 'prompt-only' ? '通常の編集レイヤーを使用' : selectedReferenceAsset ? '参照画像と同じ抽出レイヤーはAI入力から除外' : '参照画像未選択'}</small></div>
              <div className="ai-preview-item"><strong>Mask</strong><small>{aiSettings.maskMode === 'template-alpha' ? 'Template Alpha' : aiSettings.maskMode === 'selected-layer-eraser' ? 'Selected Layer Eraser' : 'Full Canvas'}</small></div>
              <div className="ai-preview-item"><strong>Reference</strong><small>{aiSettings.mode === 'prompt-only' ? '未使用' : selectedReferenceAsset?.name ?? '未選択'}</small></div>
              <div className="ai-preview-item"><strong>Mode</strong><small>{aiSettings.mode}</small></div>
              <div className="ai-preview-item"><strong>Workflow</strong><small>{aiSettings.workflowName || '未設定'}</small></div>
            </div>
            <button type="button" className="ai-run-button" disabled={aiRunning || !aiSettings.workflowJson || (aiSettings.mode !== 'prompt-only' && !selectedReferenceAsset)} onClick={() => void executeAi()}>{aiRunning ? 'ComfyUIで生成中…' : 'AIテクスチャ生成を実行'}</button>
            <p className="ai-token-help">Workflow内で __AOS_INPUT_IMAGE__ / __AOS_MASK_IMAGE__ / __AOS_REFERENCE_IMAGE__ / __AOS_POSITIVE_PROMPT__ / __AOS_NEGATIVE_PROMPT__ / __AOS_REFERENCE_STRENGTH__ / __AOS_DENOISE__ / __AOS_TEMPLATE_PRESERVE__ / __AOS_MODE__ / __AOS_OUTPUT_PREFIX__ を使用できます。</p>
          </div>

          {documentJobs.length > 0 && <div className="ai-history">
            <div className="texture-panel-heading"><span>HISTORY</span><small>{documentJobs.length}</small></div>
            {documentJobs.map((job) => <div className={`ai-history-row ${job.status}`} key={job.id} title={job.error ?? job.promptId ?? undefined}>
              <span>{job.status === 'running' ? 'RUN' : job.status === 'completed' ? 'OK' : 'ERR'}</span>
              <div><strong>{new Date(job.createdAt).toLocaleString('ja-JP')}</strong><small>{job.status === 'failed' ? job.error : `${job.mode}${job.referenceAssetName ? ` / ${job.referenceAssetName}` : ''}`}</small></div>
            </div>)}
          </div>}
        </div>
      </aside>
    </div>
  );
}
