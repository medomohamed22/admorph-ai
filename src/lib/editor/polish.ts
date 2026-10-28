// Polish geometry (pure). Polish is a creative-level setting, never a layer
// kind: the shadow and grade are derived stage nodes rendered
// from the product layer's geometry, so product pixels are never touched and
// no layer bookkeeping, critic rule or repair flow has to learn new kinds.
// Edge feathering is intentionally absent here: the SAM/local cutout already
// feathers mask alpha by one pixel (PR-A), so a second display blur would
// only soften the product.

import type { EditableLayer } from './schema';
import { fitContain } from './fit';

/** The product's actually-visible rect: the layer box contain-fits the
 * photo, so a tall can in a wide box leaves transparent margins. Shadow
 * must hug the visible can, not the wide layer box — the
 * old layer-box math made the shadow nearly twice as wide as the can and
 * left it floating below the can's true bottom edge. */
export function visibleProductBox(
  product: Pick<EditableLayer, 'x' | 'y' | 'width' | 'height'>,
  imageSize: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const fitted = fitContain({ width: product.width, height: product.height }, imageSize.width, imageSize.height);
  return { x: product.x + fitted.x, y: product.y + fitted.y, width: fitted.width, height: fitted.height };
}

export type PolishSettings = { shadow: boolean; reflection: boolean; grade: string | null };

/** Dominant scene light: left/right = light comes from that side, front = light from the camera. */
export type LightDirection = 'left' | 'right' | 'front';
export type ShadowDirection = 'auto' | LightDirection;

/** Effective cast direction: an explicit manual choice wins, otherwise the
 * vision-measured light direction, otherwise front light. */
export function resolveShadowDirection(polish: { shadowDirection?: ShadowDirection; lightDirection?: LightDirection } | undefined): LightDirection {
  if (polish?.shadowDirection && polish.shadowDirection !== 'auto') return polish.shadowDirection;
  return polish?.lightDirection ?? 'front';
}

/** Tight contact darkening straddling the product's bottom edge: darkest
 * at the touch line, fading downward. This is the layer that stops the
 * product from reading as floating. */
export function contactShadow(
  box: { x: number; y: number; width: number; height: number },
  intensity = 1,
): { x: number; y: number; width: number; height: number; opacity: number } {
  const height = Math.max(8, box.height * 0.03);
  return { x: box.x, y: box.y + box.height - height * 0.35, width: box.width, height, opacity: Math.min(0.6, 0.5 * intensity) };
}

/** Directional cast: a quadrilateral from the footprint's bottom edge,
 * skewed away from the light (light from the left throws the shadow to
 * the right) and fading toward its far edge. Front light gives a short,
 * centered cast. */
export function castShadow(
  box: { x: number; y: number; width: number; height: number },
  direction: LightDirection,
  intensity = 1,
): { points: number[]; from: { x: number; y: number }; to: { x: number; y: number }; opacity: number } {
  const bottom = box.y + box.height;
  const drop = box.height * 0.14;
  const skew = direction === 'left' ? box.width * 0.3 : direction === 'right' ? -box.width * 0.3 : 0;
  const inset = direction === 'front' ? box.width * 0.1 : 0;
  const x0 = box.x + inset, x1 = box.x + box.width - inset;
  return {
    points: [x0, bottom, x1, bottom, x1 + skew, bottom + drop, x0 + skew, bottom + drop],
    from: { x: (x0 + x1) / 2, y: bottom },
    to: { x: (x0 + x1) / 2 + skew, y: bottom + drop },
    opacity: Math.min(0.45, 0.38 * intensity),
  };
}
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


