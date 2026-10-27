// Pure, DOM-free product segmentation.
//
// The contract is simple and honest: the cutout keeps the ORIGINAL RGB pixels
// and only replaces the alpha channel with a computed mask. Feathering changes
// alpha, never RGB. This module never touches the network, never calls a
// provider, and never guesses a segmentation endpoint.

export type SegmentWarning =
  | 'empty_foreground'
  | 'background_not_removed'
  | 'foreground_small'
  | 'foreground_large';

export interface SegmentResult {
  /** 8-bit alpha mask at source dimensions (length === width * height). */
  mask: Uint8ClampedArray;
  width: number;
  height: number;
  /** Fraction of pixels with alpha > 0, in [0, 1]. */
  foregroundFraction: number;
  /** True only when the mask looks like a real product isolation. */
  reliable: boolean;
  warnings: SegmentWarning[];
}

const BACKGROUND_THRESHOLD = 48;
const FEATHER_BAND = 24;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Estimate the background color from border pixels (per-channel median). */
export function estimateBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const stride = Math.max(1, Math.floor(Math.max(width, height) / 512));
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    r.push(data[i]);
    g.push(data[i + 1]);
    b.push(data[i + 2]);
  };
  for (let x = 0; x < width; x += stride) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += stride) {
    push(0, y);
    push(width - 1, y);
  }
  return [median(r), median(g), median(b)];
}

function colorDistance(
  r: number,
  g: number,
  b: number,
  bg: [number, number, number],
): number {
  const dr = r - bg[0];
  const dg = g - bg[1];
  const db = b - bg[2];
  return Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
}

/** One separable box-blur pass (radius 1) over a single-channel buffer. */
function blurAlpha(alpha: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(alpha.length);
  const out = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const left = alpha[y * width + Math.max(0, x - 1)];
      const mid = alpha[y * width + x];
      const right = alpha[y * width + Math.min(width - 1, x + 1)];
      tmp[y * width + x] = Math.round((left + mid + right) / 3);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const up = tmp[Math.max(0, y - 1) * width + x];
      const mid = tmp[y * width + x];
      const down = tmp[Math.min(height - 1, y + 1) * width + x];
      out[y * width + x] = Math.round((up + mid + down) / 3);
    }
  }
  return out;
}

/** Keep only the largest 4-connected foreground component (alpha > 127).
 *  Only binary-foreground pixels of other components are zeroed; low-alpha
 *  feather pixels are left untouched, or soft edges would be cut hard. */
function keepLargestComponent(mask: Uint8ClampedArray, width: number, height: number): void {
  const visited = new Uint8Array(width * height);
  const allForeground = new Set<number>();
  let best: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (visited[start] || mask[start] <= 127) continue;
    const component: number[] = [];
    stack.push(start);
    visited[start] = 1;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      component.push(cur);
      allForeground.add(cur);
      const x = cur % width;
      const y = Math.floor(cur / width);
      const neighbours = [
        x > 0 ? cur - 1 : -1,
        x < width - 1 ? cur + 1 : -1,
        y > 0 ? cur - width : -1,
        y < height - 1 ? cur + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && !visited[n] && mask[n] > 127) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    if (component.length > best.length) best = component;
  }
  const keep = new Set(best);
  for (const p of allForeground) {
    if (!keep.has(p)) mask[p] = 0;
  }
}

export function segmentImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): SegmentResult {
  if (width <= 0 || height <= 0 || data.length !== width * height * 4) {
    throw new Error('invalid_image_data');
  }
  const pixelCount = width * height;
  let transparentCount = 0;
  let opaqueCount = 0;
  for (let i = 0; i < pixelCount; i++) {
    const a = data[i * 4 + 3];
    if (a < 255) transparentCount++;
    if (a > 0) opaqueCount++;
  }
  const warnings: SegmentWarning[] = [];

  // Already-transparent input: the existing alpha IS the mask. Never
  // flood-fill over a real transparency.
  if (transparentCount / pixelCount > 0.02) {
    const mask = new Uint8ClampedArray(pixelCount);
    for (let i = 0; i < pixelCount; i++) mask[i] = data[i * 4 + 3];
    const foregroundFraction = opaqueCount / pixelCount;
    if (foregroundFraction < 0.005) warnings.push('empty_foreground');
    else if (foregroundFraction < 0.05) warnings.push('foreground_small');
    return {
      mask,
      width,
      height,
      foregroundFraction,
      reliable: foregroundFraction >= 0.005,
      warnings,
    };
  }

  const bg = estimateBackground(data, width, height);
  const raw = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const d = colorDistance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], bg);
    if (d < BACKGROUND_THRESHOLD) raw[i] = 0;
    else if (d < BACKGROUND_THRESHOLD + FEATHER_BAND) {
      raw[i] = Math.round(255 * ((d - BACKGROUND_THRESHOLD) / FEATHER_BAND));
    } else raw[i] = 255;
  }
  const mask = blurAlpha(raw, width, height);
  keepLargestComponent(mask, width, height);
  let foreground = 0;
  for (let i = 0; i < pixelCount; i++) if (mask[i] > 0) foreground++;
  const foregroundFraction = foreground / pixelCount;
  if (foregroundFraction < 0.005) warnings.push('empty_foreground');
  else if (foregroundFraction > 0.995) warnings.push('background_not_removed');
  else {
    if (foregroundFraction < 0.05) warnings.push('foreground_small');
    if (foregroundFraction > 0.9) warnings.push('foreground_large');
  }
  return {
    mask,
    width,
    height,
    foregroundFraction,
    reliable: foregroundFraction >= 0.005 && foregroundFraction <= 0.995,
    warnings,
  };
}

/** Apply a mask to RGBA data. RGB bytes are copied unchanged. */
export function applyMask(data: Uint8ClampedArray, mask: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < mask.length; i++) {
    out[i * 4] = data[i * 4];
    out[i * 4 + 1] = data[i * 4 + 1];
    out[i * 4 + 2] = data[i * 4 + 2];
    out[i * 4 + 3] = Math.min(data[i * 4 + 3], mask[i]);
  }
  return out;
}

/** Bounding box of alpha > 0 pixels, or null when the mask is empty. */
export function trimBounds(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
