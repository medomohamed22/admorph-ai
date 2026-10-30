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
