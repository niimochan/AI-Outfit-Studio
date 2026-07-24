import type { AosTextureDocument, AosTextureLayer } from '@ai-outfit-studio/common';

export interface TextureSourceAsset {
  id: string;
  name: string;
  file: File;
  previewUrl: string | null;
}

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
