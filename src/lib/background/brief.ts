// Background brief: validated metadata for background-only generation.
//
// A brief carries NO pixels. It is the only thing the background generator
// is allowed to know about the product: its category, material, palette,
// mood and the zones that must stay empty. Sending product pixels to an
// image model to "generate a scene" would redraw the product; this module
// makes that impossible by construction — there is no image field anywhere.

import { z } from 'zod';
import { hexSchema } from '../db/schema';

export const rectSchema = z
  .object({
    x: z.number().int().min(0).max(1080),
    y: z.number().int().min(0).max(1350),
    width: z.number().int().min(1).max(1080),
    height: z.number().int().min(1).max(1350),
  })
  .strict();

export const backgroundStyleSchema = z.enum(['hero', 'dynamic', 'minimal']);
export type BackgroundStyle = z.infer<typeof backgroundStyleSchema>;

export const backgroundBriefSchema = z
  .object({
    productCategory: z.string().trim().min(1).max(80),
    material: z.string().trim().max(120),
    brandPalette: z.tuple([hexSchema, hexSchema, hexSchema]),
    sceneMood: z.string().trim().max(120),
    lighting: z.string().trim().max(120),
    cameraAngle: z.string().trim().max(120),
    reservedProductRect: rectSchema,
    reservedTextRects: z.array(rectSchema).max(4),
    stylePreset: backgroundStyleSchema,
    negativeConstraints: z.array(z.string().trim().min(1).max(40)).min(1),
  })
  .strict();

export type BackgroundBrief = z.infer<typeof backgroundBriefSchema>;

export const BACKGROUND_NEGATIVE_CONSTRAINTS = [
  'no product',
  'no package',
  'no logo',
  'no text',
  'no watermark',
  'no people',
] as const;

/** Reserved zones on the 1080x1350 canvas, per style. Text zones never
 *  overlap the product zone, and margins stay at or above ~8% where practical. */
export const STYLE_GEOMETRY: Record<
  BackgroundStyle,
  { productRect: z.infer<typeof rectSchema>; textRects: z.infer<typeof rectSchema>[] }
> = {
  hero: {
    productRect: { x: 200, y: 400, width: 680, height: 700 },
    textRects: [{ x: 90, y: 110, width: 900, height: 220 }],
  },
  dynamic: {
    productRect: { x: 440, y: 480, width: 520, height: 750 },
    textRects: [{ x: 90, y: 110, width: 320, height: 420 }],
  },
  minimal: {
    productRect: { x: 290, y: 420, width: 500, height: 700 },
    textRects: [{ x: 140, y: 110, width: 800, height: 180 }],
  },
};

const MATERIAL_BY_TYPE: Record<string, string> = {
  can: 'matte aluminum, condensation',
  bottle: 'clear glass',
  box: 'matte cardboard',
  cup: 'ceramic',
  other: 'product surface',
};

export interface AnalyzeInput {
  productCategory?: string;
  typeHint?: 'can' | 'bottle' | 'box' | 'cup' | 'other';
  brandColors: [string, string, string];
  sceneMood?: string;
  material?: string;
  stylePreset?: BackgroundStyle;
  lighting?: string;
  cameraAngle?: string;
}

/** Deterministic local analyzer: no model call, no invented product claims. */
export function buildBackgroundBrief(input: AnalyzeInput): BackgroundBrief {
  const stylePreset = input.stylePreset ?? 'hero';
  const geometry = STYLE_GEOMETRY[stylePreset];
  return backgroundBriefSchema.parse({
    productCategory: input.productCategory?.trim() || 'product',
    material: input.material?.trim() || MATERIAL_BY_TYPE[input.typeHint ?? 'other'],
    brandPalette: input.brandColors,
    sceneMood: input.sceneMood?.trim() || 'fresh, premium',
    lighting: input.lighting?.trim() || 'bright daylight, crisp highlights',
    cameraAngle: input.cameraAngle?.trim() || 'eye level',
    reservedProductRect: geometry.productRect,
    reservedTextRects: geometry.textRects,
    stylePreset,
    negativeConstraints: [...BACKGROUND_NEGATIVE_CONSTRAINTS],
  });
}

/** Most frequent exact opaque colors, as lowercase hex, ties broken by first
 *  appearance. Fully transparent pixels are ignored. */
export function dominantColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  count = 3,
): string[] {
  if (width <= 0 || height <= 0 || data.length !== width * height * 4) {
    throw new Error('invalid_image_data');
  }
  const counts = new Map<number, { count: number; first: number }>();
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3];
    if (a === 0) continue;
    const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { count: 1, first: i });
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, count)
    .map(([key]) => `#${key.toString(16).padStart(6, '0')}`);
}

/** The exact prompt sent for background-only generation from a brief. It
 *  contains metadata only — never pixels, never an image reference. */
export function buildBackgroundPrompt(brief: BackgroundBrief): string {
  const product = brief.reservedProductRect;
  const texts = brief.reservedTextRects
    .map((r) => `x ${r.x}–${r.x + r.width}, y ${r.y}–${r.y + r.height}`)
    .join('; ');
  return (
    `Create one advertising background only, no text, logos, product, package or watermark. ` +
    `Style: ${brief.stylePreset}. ` +
    `Product context (metadata only, do not render it): ${brief.productCategory}, ${brief.material}. ` +
    `Mood: ${brief.sceneMood}. Lighting: ${brief.lighting}. Camera: ${brief.cameraAngle}. ` +
    `Palette: ${brief.brandPalette.join(', ')}. ` +
    `Keep this product zone empty and calm: x ${product.x}–${product.x + product.width}, ` +
    `y ${product.y}–${product.y + product.height}. ` +
    `Keep these text zones empty: ${texts}. ` +
    `Negative constraints: ${brief.negativeConstraints.join(', ')}.`
  );
}
