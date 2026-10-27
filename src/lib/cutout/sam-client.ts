// SAM cutout client (browser): sends the product photo to the app's own
// /api/ai/segment route (BYOK, consent-gated) and turns the largest returned
// mask into a transparent PNG. Original RGB is never touched; only the
// alpha channel comes from SAM. Empty masks are a plain Error('segment_empty')
// so callers can offer the local fallback explicitly.

import { ProviderError } from '../ai/errors';
import { decodeToImageData, encodePng, blobToBase64 } from './raster';
import { applySamAlpha, maskToAlpha, pickLargestMask, type SamMask } from './sam';
import type { CutoutResult } from './provider';

export interface SamCutoutOptions {
  apiKey: string;
  modelId: string;
  prompt: string;
  signal?: AbortSignal;
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Map a /api/ai/segment JSON body to masks (pure; empty on malformed input). */
export function parseSegmentResponse(result: unknown): SamMask[] {
  const masks = (result as { masks?: unknown })?.masks;
  if (!Array.isArray(masks)) return [];
  const parsed: SamMask[] = [];
  for (const mask of masks) {
    const item = mask as { objectId?: unknown; left?: unknown; top?: unknown; right?: unknown; bottom?: unknown; width?: unknown; height?: unknown; rasterBase64?: unknown };
    if (
      typeof item.objectId !== 'string' ||
      typeof item.left !== 'number' ||
      typeof item.top !== 'number' ||
      typeof item.right !== 'number' ||
      typeof item.bottom !== 'number' ||
      typeof item.width !== 'number' ||
      typeof item.height !== 'number' ||
      typeof item.rasterBase64 !== 'string'
    ) continue;
    parsed.push({
      objectId: item.objectId,
      left: item.left,
      top: item.top,
      right: item.right,
      bottom: item.bottom,
      width: item.width,
      height: item.height,
      raster: base64ToBytes(item.rasterBase64),
    });
  }
  return parsed;
}

export async function samCutout(blob: Blob, options: SamCutoutOptions): Promise<CutoutResult> {
  const image = await decodeToImageData(blob);
  const data = await blobToBase64(blob);
  const response = await fetch('/api/ai/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: 'meta',
      apiKey: options.apiKey,
      modelId: options.modelId,
      consent: true,
      imageConsent: true,
      image: { mimeType: blob.type, data },
      prompt: options.prompt,
    }),
    signal: options.signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new ProviderError(result?.error?.code ?? 'invalid_response', response.status);
  const masks = parseSegmentResponse(result);
  const picked = pickLargestMask(masks);
  if (!picked) throw new Error('segment_empty');
  const alpha = maskToAlpha(picked, image.width, image.height);
  const cutoutData = applySamAlpha(image.data, alpha);
  const maskData = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    maskData[i * 4] = alpha[i];
    maskData[i * 4 + 1] = alpha[i];
    maskData[i * 4 + 2] = alpha[i];
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
    provider: 'meta-sam',
    reliable: true,
    warnings: [],
  };
}
