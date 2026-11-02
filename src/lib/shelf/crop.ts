/**
 * SAM returns the cutout at the full shelf-photo size with everything else
 * transparent. Crop it to the product's own alpha bounds (plus a little
 * air) so cards, mockups and the painter get the product alone.
 */
export function alphaBounds(alpha: Uint8ClampedArray, width: number, height: number, threshold = 16) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3] > threshold) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

export async function cropToProduct(cutout: Blob, padding = 0.06): Promise<Blob> {
  const bitmap = await createImageBitmap(cutout);
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const bounds = alphaBounds(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (!bounds) throw new Error('empty_cutout');
    const pad = Math.round(Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) * padding);
    const x = Math.max(0, bounds.left - pad), y = Math.max(0, bounds.top - pad);
    const w = Math.min(canvas.width, bounds.right + pad) - x, h = Math.min(canvas.height, bounds.bottom + pad) - y;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => out.toBlob(value => value ? resolve(value) : reject(new Error('crop_failed')), 'image/png'));
  } finally { bitmap.close(); }
}

/** Crop fractions, the share of a box added on every side, and the largest side of the crop. */
export const CUT_CROP_PAD = 0.3;
export const CUT_CROP_MAX_SIDE = 1600;
type Box = { left: number; top: number; right: number; bottom: number };
/** The padded crop window around a box, in fractions of the photo (clamped inside it). */
export function cropWindow(box: Box, pad = CUT_CROP_PAD): Box {
  const w = box.right - box.left, h = box.bottom - box.top;
  return { left: Math.max(0, box.left - w * pad), top: Math.max(0, box.top - h * pad), right: Math.min(1, box.right + w * pad), bottom: Math.min(1, box.bottom + h * pad) };
}
/** The box in fractions of the crop window. */
export function boxInWindow(box: Box, window: Box): Box {
  const w = window.right - window.left, h = window.bottom - window.top;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { left: clamp((box.left - window.left) / w), top: clamp((box.top - window.top) / h), right: clamp((box.right - window.left) / w), bottom: clamp((box.bottom - window.top) / h) };
}
/**
 * Cut each shelf product from its own crop of the full-resolution photo, not
 * from the whole shelf: SAM's mask is coarser than the photo and is scaled
 * up, so a product that fills a crop gets a cleaner edge, and the painter's
 * close-up keeps the label's words sharp.
 */
export async function cropAround(source: Blob, box: Box): Promise<{ blob: Blob; box: Box }> {
  const bitmap = await createImageBitmap(source);
  try {
    const window = cropWindow(box);
    const sx = Math.round(window.left * bitmap.width), sy = Math.round(window.top * bitmap.height);
    const sw = Math.max(1, Math.round((window.right - window.left) * bitmap.width)), sh = Math.max(1, Math.round((window.bottom - window.top) * bitmap.height));
    const scale = Math.min(1, CUT_CROP_MAX_SIDE / Math.max(sw, sh));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext('2d')!; context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('crop_failed')), 'image/jpeg', 0.92));
    // The window in exact pixel terms, so the box lands where the product is.
    const exact = { left: sx / bitmap.width, top: sy / bitmap.height, right: (sx + sw) / bitmap.width, bottom: (sy + sh) / bitmap.height };
    return { blob, box: boxInWindow(box, exact) };
  } finally { bitmap.close(); }
}
