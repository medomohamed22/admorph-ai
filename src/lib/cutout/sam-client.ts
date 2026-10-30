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

/**
 * A vision box is often drawn tight, or a little inside the product's edge,
 * and SAM never masks past the box it is given: a tight box cuts the
 * product. Grow the box by `pad` of its own size on every side first.
 */
export const BOX_PAD = 0.05;
/** The one wider retry when the mask still runs into the box edge. */
export const BOX_PAD_RETRY = 0.2;
export function padBoxFractions(box: { left: number; top: number; right: number; bottom: number }, pad: number) {
  const width = box.right - box.left, height = box.bottom - box.top;
  return {
    left: Math.max(0, box.left - width * pad),
    top: Math.max(0, box.top - height * pad),
    right: Math.min(1, box.right + width * pad),
    bottom: Math.min(1, box.bottom + height * pad),
  };
}

/**
 * Sides where the mask runs into the box edge: the product most likely
 * continues past it. A side on the image border never counts (the product
 * may really end there). A side counts when more than `share` of that box
 * edge is covered by the mask.
 */
export function clippedSides(alpha: Uint8ClampedArray, width: number, height: number, box: { left: number; top: number; right: number; bottom: number }, share = 0.08): ('left' | 'top' | 'right' | 'bottom')[] {
  const sides: ('left' | 'top' | 'right' | 'bottom')[] = [];
  const covered = (pixels: number[]) => pixels.filter(index => alpha[index] > 127).length / Math.max(1, pixels.length);
  const column = (x: number) => Array.from({ length: box.bottom - box.top }, (_, i) => (box.top + i) * width + x);
  const row = (y: number) => Array.from({ length: box.right - box.left }, (_, i) => y * width + box.left + i);
  if (box.left > 0 && covered(column(box.left)) > share) sides.push('left');
  if (box.right < width && covered(column(box.right - 1)) > share) sides.push('right');
  if (box.top > 0 && covered(row(box.top)) > share) sides.push('top');
  if (box.bottom < height && covered(row(box.bottom - 1)) > share) sides.push('bottom');
  return sides;
}

/**
 * Remove small pieces of the mask that do not touch the product: a box that
 * also covers a price tag or a shelf edge can leave detached fragments under
 * the product. Every connected piece smaller than `share` of the largest one
 * is cleared; a product made of several large parts keeps them all.
 */
export function dropSmallIslands(alpha: Uint8ClampedArray, width: number, height: number, share = 0.15): number {
  const labels = new Int32Array(width * height);
  const sizes: number[] = [0];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < alpha.length; start++) {
    if (alpha[start] <= 127 || labels[start]) continue;
    const label = sizes.length; let top = 0, size = 0;
    stack[top++] = start; labels[start] = label;
    while (top) {
      const pixel = stack[--top]; size++;
      const x = pixel % width;
      const next = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel - width, pixel + width];
      for (const n of next) if (n >= 0 && n < alpha.length && !labels[n] && alpha[n] > 127) { labels[n] = label; stack[top++] = n; }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  let cleared = 0;
  if (sizes.length <= 2) return 0;
  for (let i = 0; i < alpha.length; i++) {
    const label = labels[i];
    if (label && sizes[label] < largest * share) { alpha[i] = 0; cleared++; }
  }
  return cleared;
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
  const ask = async (promptBody: Record<string, unknown>) => {
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
    const picked = pickLargestMask(parseSegmentResponse(result));
    if (!picked) throw new ProviderError('sam_no_mask', 502, { source: 'application', message: 'segment response had no masks' });
    return maskToAlpha(picked, image.width, image.height);
  };
  let alpha: Uint8ClampedArray;
  if (options.box) {
    const pixels = boxFractionsToPixels(padBoxFractions(options.box, BOX_PAD), image.width, image.height);
    alpha = await ask({ box: pixels, size });
    // Still running into the box edge: the box was too tight. One wider try;
    // the first cut stays if the retry fails.
    if (clippedSides(alpha, image.width, image.height, pixels).length) {
      try { alpha = await ask({ box: boxFractionsToPixels(padBoxFractions(options.box, BOX_PAD_RETRY), image.width, image.height), size }); }
      catch { /* keep the first cut */ }
    }
  } else {
    alpha = await ask(options.point ? { point: pointFractionsToPixels(options.point, image.width, image.height), size } : { prompt: options.prompt });
  }
  dropSmallIslands(alpha, image.width, image.height);
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
