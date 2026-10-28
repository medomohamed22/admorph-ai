// Pixel-level contrast review: pure functions over RGBA buffers, so they are
// unit-testable without a canvas. The studio decodes blobs into these buffers
// and reports the ratios; nothing here touches the DOM or the network.

export type RgbaImage = { width: number; height: number; data: ArrayLike<number> };
export type Rect = { x: number; y: number; width: number; height: number };

/** WCAG contrast floors used by the post-background review. */
export const PRODUCT_CONTRAST_MIN = 1.8;
export const TEXT_CONTRAST_MIN = 4.5;

function linear(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function luminanceOfHex(hex: string): number {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) return 0;
  return luminance(parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16));
}

export function contrastFromLuminance(a: number, b: number): number {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

function clampRect(image: RgbaImage, rect: Rect): Rect {
  const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
  const width = Math.max(0, Math.min(image.width - x, Math.ceil(rect.width)));
  const height = Math.max(0, Math.min(image.height - y, Math.ceil(rect.height)));
  return { x, y, width, height };
}

/** Mean luminance of the pixels in a rect (empty rects return null). */
export function meanLuminance(image: RgbaImage, rect: Rect): number | null {
  const box = clampRect(image, rect);
  if (box.width === 0 || box.height === 0) return null;
  let sum = 0, count = 0;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * image.width + x) * 4;
      sum += luminance(image.data[i], image.data[i + 1], image.data[i + 2]);
      count++;
    }
  }
  return count === 0 ? null : sum / count;
}

/**
 * Product-vs-background contrast. The product buffer holds the product image
 * drawn at its layer rect on a transparent canvas; product pixels are the
 * opaque ones inside the rect. Surround is a ring around the rect (dilated by
 * ~8% of the canvas width, minus the rect itself). Returns null when either
 * sample is empty (no cutout pixels, degenerate rect).
 */
export function productBackgroundContrast(background: RgbaImage, product: RgbaImage, rect: Rect): number | null {
  const box = clampRect(background, rect);
  if (box.width === 0 || box.height === 0) return null;
  let productSum = 0, productCount = 0;
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * background.width + x) * 4;
      // The product's own pixels (not the background behind it) against the
      // surrounding background is what the eye actually compares.
      if (product.data[i + 3] > 128) {
        productSum += luminance(product.data[i], product.data[i + 1], product.data[i + 2]);
        productCount++;
      }
    }
  }
  if (productCount === 0) return null;
  const margin = Math.max(24, Math.round(background.width * 0.08));
  const ring = clampRect(background, { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 });
  let surroundSum = 0, surroundCount = 0;
  for (let y = ring.y; y < ring.y + ring.height; y++) {
    for (let x = ring.x; x < ring.x + ring.width; x++) {
      if (x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height) continue;
      const i = (y * background.width + x) * 4;
      surroundSum += luminance(background.data[i], background.data[i + 1], background.data[i + 2]);
      surroundCount++;
    }
  }
  if (surroundCount === 0) return null;
  return contrastFromLuminance(productSum / productCount, surroundSum / surroundCount);
}

/** Text color vs the actual background pixels behind the layer rect. */
export function textBackgroundContrast(background: RgbaImage, rect: Rect, textHex: string): number | null {
  const mean = meanLuminance(background, rect);
  return mean === null ? null : contrastFromLuminance(mean, luminanceOfHex(textHex));
}
