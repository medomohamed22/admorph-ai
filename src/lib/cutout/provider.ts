// Cutout provider contract (browser adapter).
//
// Only the local provider is implemented. Meta SAM is deliberately NOT wired:
// the current Meta task catalog has no `segment` task, so its endpoint,
// request/response shape and price are unverified. Inventing that adapter
// would risk billable failed calls and false "Meta cutout" claims. There is
// intentionally no /api/ai/cutout route until a segmentation task is verified
// in the catalog. The local path runs entirely in the browser and sends no
// image anywhere.

import { applyMask, segmentImageData, type SegmentWarning } from './segment';

export type CutoutProviderId = 'local' | 'meta-sam';

export interface CutoutProviderInfo {
  id: CutoutProviderId;
  available: boolean;
  reason: string;
}

/** Meta SAM availability is a fact, not a guess: unverified, so unavailable. */
export const metaSamAvailable = false;

export const cutoutProviders: CutoutProviderInfo[] = [
  { id: 'local', available: true, reason: 'local_browser' },
  { id: 'meta-sam', available: false, reason: 'unverified' },
];

export interface CutoutResult {
  /** Grayscale PNG rendering of the alpha mask at source dimensions. */
  maskBlob: Blob;
  /** Transparent PNG: original RGB + generated alpha. */
  cutoutBlob: Blob;
  sourceWidth: number;
  sourceHeight: number;
  provider: CutoutProviderId;
  reliable: boolean;
  warnings: SegmentWarning[];
}

async function decodeToImageData(blob: Blob): Promise<ImageData> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas_unavailable');
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode_failed'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encodePng(data: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  // Copy into a fresh ArrayBuffer-backed array: ImageData requires
  // Uint8ClampedArray<ArrayBuffer>, not a generic ArrayBufferLike view.
  const clamped = new Uint8ClampedArray(data);
  ctx.putImageData(new ImageData(clamped, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('encode_failed');
  return blob;
}

export async function localCutout(blob: Blob): Promise<CutoutResult> {
  const image = await decodeToImageData(blob);
  const segment = segmentImageData(image.data, image.width, image.height);
  const cutoutData = applyMask(image.data, segment.mask);
  const maskData = new Uint8ClampedArray(segment.mask.length * 4);
  for (let i = 0; i < segment.mask.length; i++) {
    maskData[i * 4] = segment.mask[i];
    maskData[i * 4 + 1] = segment.mask[i];
    maskData[i * 4 + 2] = segment.mask[i];
    maskData[i * 4 + 3] = 255;
  }
  const [cutoutBlob, maskBlob] = await Promise.all([
    encodePng(cutoutData, image.width, image.height),
    encodePng(maskData, image.width, image.height),
  ]);
  return {
    maskBlob,
    cutoutBlob,
    sourceWidth: image.width,
    sourceHeight: image.height,
    provider: 'local',
    reliable: segment.reliable,
    warnings: segment.warnings,
  };
}

export async function cutoutImage(blob: Blob, provider: CutoutProviderId): Promise<CutoutResult> {
  if (provider === 'meta-sam') throw new Error('meta_sam_unavailable');
  return localCutout(blob);
}
