// SAM cutout client (browser): sends the product photo to the app's own
// /api/ai/segment route (BYOK, consent-gated) and turns the largest returned
// mask into a transparent PNG. Original RGB is never touched; only the
// alpha channel comes from SAM. Empty masks throw sam_no_mask (never a
// silent fallback), and server error bodies keep their code + details so a
// live failure says exactly what went wrong.

import { ProviderError, errorCodes, type ErrorDetails } from '../ai/errors';
import { decodeToImageData, encodePng, blobToBase64 } from './raster';
import { applySamAlpha, maskToAlpha, pickLargestMask, type SamMask } from './sam';
import type { CutoutResult } from './provider';

export interface SamCutoutOptions {
  apiKey: string;
  modelId: string;
  /** Noun phrase. Optional when a geometric prompt (box or point) is given. */
  prompt?: string;
  /** Fractions of the image size (0..1). When present, SAM gets a geometric prompt instead of the noun phrase. */
  box?: { left: number; top: number; right: number; bottom: number };
  /** Fractions of the image size (0..1). A tap point; same geometric path as box. */
  point?: { x: number; y: number };
  signal?: AbortSignal;
}

/** Fractions to half-open pixel box, clamped inside the image, never empty. */
export function boxFractionsToPixels(box: { left: number; top: number; right: number; bottom: number }, width: number, height: number) {
  const left = Math.max(0, Math.floor(box.left * width));
  const top = Math.max(0, Math.floor(box.top * height));
  let right = Math.min(width, Math.ceil(box.right * width));
  let bottom = Math.min(height, Math.ceil(box.bottom * height));
  if (right <= left) right = Math.min(width, left + 1);
  if (bottom <= top) bottom = Math.min(height, top + 1);
  return { left, top, right, bottom };
}

/** Fractions to a pixel point, clamped inside the image. */
export function pointFractionsToPixels(point: { x: number; y: number }, width: number, height: number) {
  return { x: Math.max(0, Math.min(width - 1, Math.floor(point.x * width))), y: Math.max(0, Math.min(height - 1, Math.floor(point.y * height))) };
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

/** Map a /api/ai/segment error body to a ProviderError, preserving the
 * server's code + details when well-formed; anything else becomes the
 * generic invalid_response so a malformed body cannot hide a failure. */
export function segmentErrorBody(result: unknown, status: number): ProviderError {
  const error = (result as { error?: unknown } | null)?.error;
  const code = (error as { code?: unknown } | null)?.code;
  const known = typeof code === 'string' && (errorCodes as readonly string[]).includes(code);
  return new ProviderError(known ? (code as typeof errorCodes[number]) : 'invalid_response', status, segmentErrorDetails((error as { details?: unknown } | null)?.details));
}

function segmentErrorDetails(value: unknown): ErrorDetails | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.source !== 'application' && raw.source !== 'meta' && raw.source !== 'internal') return undefined;
  const details: ErrorDetails = { source: raw.source };
  if (typeof raw.message === 'string') details.message = raw.message.slice(0, 500);
  if (Array.isArray(raw.fields)) details.fields = raw.fields.filter((field): field is string => typeof field === 'string').slice(0, 12);
  if (typeof raw.parameter === 'string') details.parameter = raw.parameter.slice(0, 100);
  if (typeof raw.upstreamStatus === 'number') details.upstreamStatus = raw.upstreamStatus;
  return details;
}

export async function samCutout(blob: Blob, options: SamCutoutOptions): Promise<CutoutResult> {
  const image = await decodeToImageData(blob);
  const data = await blobToBase64(blob);
  if (!options.box && !options.point && !options.prompt) throw new Error('sam_prompt_missing');
  const size = { width: image.width, height: image.height };
  const promptBody = options.box
    ? { box: boxFractionsToPixels(options.box, image.width, image.height), size }
    : options.point
      ? { point: pointFractionsToPixels(options.point, image.width, image.height), size }
      : { prompt: options.prompt };
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
      ...promptBody,
    }),
    signal: options.signal,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw segmentErrorBody(result, response.status);
  const masks = parseSegmentResponse(result);
  const picked = pickLargestMask(masks);
  if (!picked) throw new ProviderError('sam_no_mask', 502, { source: 'application', message: 'segment response had no masks' });
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
