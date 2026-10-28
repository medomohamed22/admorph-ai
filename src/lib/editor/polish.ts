// Polish geometry (pure). Polish is a creative-level setting, never a layer
// kind: the shadow, reflection and grade are derived stage nodes rendered
// from the product layer's geometry, so product pixels are never touched and
// no layer bookkeeping, critic rule or repair flow has to learn new kinds.
// Edge feathering is intentionally absent here: the SAM/local cutout already
// feathers mask alpha by one pixel (PR-A), so a second display blur would
// only soften the product.

import type { EditableLayer } from './schema';

export type PolishSettings = { shadow: boolean; reflection: boolean; grade: string | null };

type Box = { x: number; y: number; width: number; height: number };

/** Soft ellipse centered under the product; null when the product touches the canvas bottom. */
export function shadowBox(
  product: Pick<EditableLayer, 'x' | 'y' | 'width' | 'height'>,
  dimensions: { width: number; height: number },
): { cx: number; cy: number; rx: number; ry: number } | null {
  const cx = product.x + product.width / 2;
  const cy = product.y + product.height + product.height * 0.02;
  if (cy >= dimensions.height) return null;
  const rx = Math.min(product.width * 0.55, cx, dimensions.width - cx);
  const ry = Math.min(product.height * 0.06, dimensions.height - cy);
  if (rx <= 0 || ry <= 0) return null;
  return { cx, cy, rx, ry };
}

/** Mirrored strip below the product; null when there is no room under it. */
export function reflectionBox(
  product: Pick<EditableLayer, 'x' | 'y' | 'width' | 'height'>,
  dimensions: { width: number; height: number },
): Box | null {
  const y = product.y + product.height + 8;
  if (y >= dimensions.height) return null;
  return { x: product.x, y, width: product.width, height: Math.min(product.height * 0.35, dimensions.height - y) };
}
