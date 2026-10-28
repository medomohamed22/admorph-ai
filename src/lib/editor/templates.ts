// Layout templates: pure geometry rearrangements for a creative.
// Only x/y/width/height change; text, colors, fonts, images, visibility and
// opacity are preserved, so applying a template never destroys user work.
// Geometry is expressed as fractions of the canvas so one template works on
// every platform size. The background always fills the canvas.

import type { EditableLayer } from './schema';

export const TEMPLATE_IDS = ['hero-center', 'split', 'minimal'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

type Box = { x: number; y: number; width: number; height: number };

const LAYOUTS: Record<TemplateId, Partial<Record<EditableLayer['kind'], Box>>> = {
  'hero-center': {
    brand: { x: 0.069, y: 0.044, width: 0.648, height: 0.067 },
    logo: { x: 0.787, y: 0.041, width: 0.139, height: 0.089 },
    headline: { x: 0.069, y: 0.152, width: 0.861, height: 0.196 },
    product: { x: 0.204, y: 0.378, width: 0.593, height: 0.437 },
    cta: { x: 0.167, y: 0.874, width: 0.667, height: 0.074 },
  },
  split: {
    brand: { x: 0.055, y: 0.04, width: 0.5, height: 0.07 },
    logo: { x: 0.83, y: 0.03, width: 0.12, height: 0.08 },
    headline: { x: 0.055, y: 0.18, width: 0.42, height: 0.55 },
    product: { x: 0.51, y: 0.26, width: 0.44, height: 0.53 },
    cta: { x: 0.055, y: 0.87, width: 0.89, height: 0.074 },
  },
  minimal: {
    brand: { x: 0.25, y: 0.04, width: 0.5, height: 0.06 },
    logo: { x: 0.83, y: 0.03, width: 0.12, height: 0.08 },
    headline: { x: 0.07, y: 0.74, width: 0.86, height: 0.12 },
    product: { x: 0.11, y: 0.14, width: 0.78, height: 0.58 },
    cta: { x: 0.28, y: 0.88, width: 0.44, height: 0.06 },
  },
};

export function applyTemplate(
  layers: EditableLayer[],
  template: TemplateId,
  dimensions: { width: number; height: number },
): EditableLayer[] {
  const layout = LAYOUTS[template];
  return layers.map((layer) => {
    if (layer.kind === 'background') return { ...layer, x: 0, y: 0, width: dimensions.width, height: dimensions.height };
    const box = layout[layer.kind];
    if (!box) return layer;
    return {
      ...layer,
      x: Math.round(box.x * dimensions.width),
      y: Math.round(box.y * dimensions.height),
      width: Math.round(box.width * dimensions.width),
      height: Math.round(box.height * dimensions.height),
    };
  });
}
