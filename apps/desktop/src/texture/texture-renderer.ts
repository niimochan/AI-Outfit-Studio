import type { AosReferenceFitMode, AosReferencePrepSettings, AosTextureDocument, AosTextureLayer } from '@ai-outfit-studio/common';

export interface TextureSourceAsset {
  id: string;
  name: string;
  file: File;
  previewUrl: string | null;
}

export type TextureFitMode = 'contain' | 'cover' | 'stretch' | 'original';
export type TextureMaskMode = 'template-alpha' | 'selected-layer-eraser' | 'full-canvas';

export interface TextureDocumentOutput {
  id: string;
  documentId: string;
  name: string;
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'none', premultiplyAlpha: 'default' });
  } catch {
    return createImageBitmap(file);
  }
}

function applyLayerTransform(
  context: CanvasRenderingContext2D,
  layer: AosTextureLayer,
  bitmap: ImageBitmap,
): void {
  context.translate(layer.x, layer.y);
  context.rotate((layer.rotation * Math.PI) / 180);
  context.scale(layer.scaleX, layer.scaleY);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
}

export async function renderTextureDocument(
  document: AosTextureDocument,
  assets: Map<string, TextureSourceAsset>,
  targetCanvas?: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const canvas = targetCanvas ?? window.document.createElement('canvas');
  canvas.width = Math.min(16384, Math.max(1, Math.round(document.width)));
  canvas.height = Math.min(16384, Math.max(1, Math.round(document.height)));
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    throw new Error('2D Canvasを初期化できませんでした。');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const templateAsset = assets.get(document.templateAssetId);
  const templateBitmap = templateAsset ? await decodeImage(templateAsset.file) : null;

  try {
    if (document.showTemplateBase && templateBitmap) {
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.drawImage(templateBitmap, 0, 0, canvas.width, canvas.height);
    }

    for (const layer of document.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const source = assets.get(layer.sourceAssetId);
      if (!source) continue;
      const bitmap = await decodeImage(source.file);
      const layerCanvas = window.document.createElement('canvas');
      layerCanvas.width = canvas.width;
      layerCanvas.height = canvas.height;
      const layerContext = layerCanvas.getContext('2d', { alpha: true });
      if (!layerContext) {
        bitmap.close();
        continue;
      }
      layerContext.imageSmoothingEnabled = true;
      layerContext.imageSmoothingQuality = 'high';
      layerContext.save();
      applyLayerTransform(layerContext, layer, bitmap);
      layerContext.restore();

      if (layer.eraserStrokes.length > 0) {
        layerContext.globalCompositeOperation = 'destination-out';
        layerContext.lineCap = 'round';
        layerContext.lineJoin = 'round';
        for (const stroke of layer.eraserStrokes) {
          layerContext.beginPath();
          layerContext.arc(stroke.x, stroke.y, Math.max(1, stroke.radius), 0, Math.PI * 2);
          layerContext.fill();
        }
      }

      context.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
      context.globalCompositeOperation = layer.blendMode;
      context.drawImage(layerCanvas, 0, 0);
      bitmap.close();
    }

    context.globalAlpha = 1;
    if (document.maskToTemplateAlpha && templateBitmap) {
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(templateBitmap, 0, 0, canvas.width, canvas.height);
    }
    context.globalCompositeOperation = 'source-over';
    return canvas;
  } finally {
    templateBitmap?.close();
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG画像の生成に失敗しました。'));
    }, 'image/png');
  });
}

export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await decodeImage(file);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

interface AlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function alphaBounds(imageData: ImageData, alphaThreshold = 8): AlphaBounds | null {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function cornerBackgroundColor(imageData: ImageData): [number, number, number] {
  const { data, width, height } = imageData;
  const sampleRadiusX = Math.max(2, Math.round(width * 0.025));
  const sampleRadiusY = Math.max(2, Math.round(height * 0.025));
  const regions = [
    [0, 0],
    [Math.max(0, width - sampleRadiusX), 0],
    [0, Math.max(0, height - sampleRadiusY)],
    [Math.max(0, width - sampleRadiusX), Math.max(0, height - sampleRadiusY)],
  ] as const;
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;
  for (const [startX, startY] of regions) {
    for (let y = startY; y < Math.min(height, startY + sampleRadiusY); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sampleRadiusX); x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = (data[offset + 3] ?? 0) / 255;
        if (alpha <= 0.05) continue;
        red += (data[offset] ?? 0) * alpha;
        green += (data[offset + 1] ?? 0) * alpha;
        blue += (data[offset + 2] ?? 0) * alpha;
        weight += alpha;
      }
    }
  }
  if (weight <= 0) return [255, 255, 255];
  return [red / weight, green / weight, blue / weight];
}

export async function extractReferenceImage(
  file: File,
  settings: AosReferencePrepSettings,
): Promise<HTMLCanvasElement> {
  const bitmap = await decodeImage(file);
  const canvas = window.document.createElement('canvas');
  const maximumDimension = 4096;
  const downscale = Math.min(1, maximumDimension / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * downscale));
  canvas.height = Math.max(1, Math.round(bitmap.height * downscale));
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('参考画像の抽出用Canvasを初期化できませんでした。');
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  if (settings.extractMode === 'alpha-only') return canvas;

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const background: [number, number, number] = settings.extractMode === 'white-background'
    ? [255, 255, 255]
    : settings.extractMode === 'black-background'
      ? [0, 0, 0]
      : cornerBackgroundColor(imageData);
  const threshold = clamp01(settings.threshold);
  const feather = Math.max(0.001, clamp01(settings.feather));
  const maximumDistance = Math.sqrt(3 * 255 * 255);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const originalAlpha = (imageData.data[index + 3] ?? 0) / 255;
    if (originalAlpha <= 0) continue;
    const redDelta = (imageData.data[index] ?? 0) - background[0];
    const greenDelta = (imageData.data[index + 1] ?? 0) - background[1];
    const blueDelta = (imageData.data[index + 2] ?? 0) - background[2];
    const distance = Math.sqrt(redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta) / maximumDistance;
    const extractedAlpha = clamp01((distance - threshold + feather * 0.5) / feather);
    imageData.data[index + 3] = Math.round(255 * originalAlpha * extractedAlpha);
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function imageAlphaBounds(file: File): Promise<{ width: number; height: number; bounds: AlphaBounds }> {
  const bitmap = await decodeImage(file);
  try {
    const canvas = window.document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    if (!context) throw new Error('画像のAlpha範囲を解析できませんでした。');
    context.drawImage(bitmap, 0, 0);
    const bounds = alphaBounds(context.getImageData(0, 0, canvas.width, canvas.height)) ?? {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
    return { width: canvas.width, height: canvas.height, bounds };
  } finally {
    bitmap.close();
  }
}

export async function fitPreparedReferenceLayer(
  layer: AosTextureLayer,
  source: TextureSourceAsset,
  template: TextureSourceAsset,
  documentWidth: number,
  documentHeight: number,
  fitMode: AosReferenceFitMode,
  padding: number,
): Promise<AosTextureLayer> {
  if (fitMode === 'contain' || fitMode === 'cover') {
    return fitTextureLayer(layer, source, documentWidth, documentHeight, fitMode);
  }

  const [sourceInfo, templateInfo] = await Promise.all([
    imageAlphaBounds(source.file),
    imageAlphaBounds(template.file),
  ]);
  const normalizedPadding = Math.min(0.3, Math.max(0, padding));
  const targetBounds = {
    x: (templateInfo.bounds.x / templateInfo.width) * documentWidth,
    y: (templateInfo.bounds.y / templateInfo.height) * documentHeight,
    width: (templateInfo.bounds.width / templateInfo.width) * documentWidth,
    height: (templateInfo.bounds.height / templateInfo.height) * documentHeight,
  };
  const usableWidth = Math.max(1, targetBounds.width * (1 - normalizedPadding * 2));
  const usableHeight = Math.max(1, targetBounds.height * (1 - normalizedPadding * 2));
  const scale = Math.min(usableWidth / sourceInfo.bounds.width, usableHeight / sourceInfo.bounds.height);
  const targetCenterX = targetBounds.x + targetBounds.width / 2;
  const targetCenterY = targetBounds.y + targetBounds.height / 2;
  const sourceCenterOffsetX = sourceInfo.bounds.x + sourceInfo.bounds.width / 2 - sourceInfo.width / 2;
  const sourceCenterOffsetY = sourceInfo.bounds.y + sourceInfo.bounds.height / 2 - sourceInfo.height / 2;

  return {
    ...layer,
    x: targetCenterX - sourceCenterOffsetX * scale,
    y: targetCenterY - sourceCenterOffsetY * scale,
    scaleX: scale,
    scaleY: scale,
    rotation: 0,
  };
}

export async function createDefaultTextureLayer(
  source: TextureSourceAsset,
  documentWidth: number,
  documentHeight: number,
): Promise<AosTextureLayer> {
  const dimensions = await getImageDimensions(source.file);
  const fitScale = Math.min(documentWidth / dimensions.width, documentHeight / dimensions.height, 1) * 0.82;
  return {
    id: crypto.randomUUID(),
    name: source.name,
    sourceAssetId: source.id,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    x: documentWidth / 2,
    y: documentHeight / 2,
    scaleX: fitScale,
    scaleY: fitScale,
    rotation: 0,
    eraserStrokes: [],
  };
}


export async function fitTextureLayer(
  layer: AosTextureLayer,
  source: TextureSourceAsset,
  documentWidth: number,
  documentHeight: number,
  mode: TextureFitMode,
): Promise<AosTextureLayer> {
  const dimensions = await getImageDimensions(source.file);
  const widthScale = documentWidth / dimensions.width;
  const heightScale = documentHeight / dimensions.height;
  let scaleX = 1;
  let scaleY = 1;
  if (mode === 'contain') {
    const scale = Math.min(widthScale, heightScale);
    scaleX = scale;
    scaleY = scale;
  } else if (mode === 'cover') {
    const scale = Math.max(widthScale, heightScale);
    scaleX = scale;
    scaleY = scale;
  } else if (mode === 'stretch') {
    scaleX = widthScale;
    scaleY = heightScale;
  }
  return {
    ...layer,
    x: documentWidth / 2,
    y: documentHeight / 2,
    scaleX,
    scaleY,
    rotation: 0,
  };
}

export async function renderTextureMask(
  document: AosTextureDocument,
  assets: Map<string, TextureSourceAsset>,
  mode: TextureMaskMode,
  selectedLayerId: string | null,
): Promise<HTMLCanvasElement> {
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.min(16384, Math.max(1, Math.round(document.width)));
  canvas.height = Math.min(16384, Math.max(1, Math.round(document.height)));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('AIマスク用Canvasを初期化できませんでした。');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (mode === 'full-canvas') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas;
  }

  if (mode === 'selected-layer-eraser') {
    const layer = document.layers.find((entry) => entry.id === selectedLayerId);
    if (!layer || layer.eraserStrokes.length === 0) {
      throw new Error('選択レイヤーに消しゴム領域がありません。消しゴムでAI編集範囲を描いてください。');
    }
    context.fillStyle = '#ffffff';
    for (const stroke of layer.eraserStrokes) {
      context.beginPath();
      context.arc(stroke.x, stroke.y, Math.max(1, stroke.radius), 0, Math.PI * 2);
      context.fill();
    }
    return canvas;
  }

  const template = assets.get(document.templateAssetId);
  if (!template) throw new Error('テンプレート画像が見つかりません。');
  const bitmap = await decodeImage(template.file);
  try {
    const alphaCanvas = window.document.createElement('canvas');
    alphaCanvas.width = canvas.width;
    alphaCanvas.height = canvas.height;
    const alphaContext = alphaCanvas.getContext('2d', { alpha: true });
    if (!alphaContext) throw new Error('テンプレートAlphaを取得できませんでした。');
    alphaContext.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    alphaContext.globalCompositeOperation = 'source-in';
    alphaContext.fillStyle = '#ffffff';
    alphaContext.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(alphaCanvas, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}
