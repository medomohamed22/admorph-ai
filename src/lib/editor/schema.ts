import { z } from 'zod';
import { selectionSchema } from '../db/schema';
import { dimensionsFor, SIZE_FORMATS } from '../editor/sizes';
export const polishSchema = z.object({
  shadow: z.boolean(), reflection: z.boolean(), grade: z.string().regex(/^#[\da-f]{6}$/i).nullable(),
  lightDirection: z.enum(['left', 'right', 'front']).optional(),
  shadowDirection: z.enum(['auto', 'left', 'right', 'front']).optional(),
  shadowIntensity: z.number().min(0.5).max(1.5).optional(),
}).strict();
export type Polish = z.infer<typeof polishSchema>;
export const layerSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['background', 'product', 'logo', 'headline', 'brand', 'cta']),
  x: z.number().min(0).max(1080), y: z.number().min(0).max(1920), width: z.number().min(24).max(1080), height: z.number().min(24).max(1920),
  text: z.string().max(500), color: z.string().regex(/^#[\da-f]{6}$/i), fill: z.union([z.string().regex(/^#[\da-f]{6}$/i), z.literal('transparent')]),
  fontFamily: z.enum(['Inter', 'Cairo']), fontStyle: z.enum(['normal', 'bold']).optional(), fontSize: z.number().min(12).max(160),
  dir: z.enum(['auto', 'ltr', 'rtl']).optional(),
  opacity: z.number().min(0).max(1).optional(), visible: z.boolean(), assetId: z.string().uuid().nullable(),
}).strict().refine(layer => layer.x + layer.width <= 1080.01 && layer.y + layer.height <= 1920.01, 'layer_bounds');
export type EditableLayer = z.infer<typeof layerSchema>;
export const creativeSchema = z.object({
  id: z.string().uuid(), campaignId: z.string().uuid(), conceptId: z.string().uuid(),
  layers: z.array(layerSchema).min(1).max(10), caption: z.string().max(1200),
  source: z.enum(['composition', 'local', 'gemini', 'meta']), model: selectionSchema.nullable(),
  placement: z.enum(['off','feed','reels']).optional(), inputRevision: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  // Derived stage nodes only (shadow/grade); never a layer kind,
  // so product pixels stay untouched and no rule or repair flow changes.
  polish: polishSchema.optional(),
  // Style target only: shown side-by-side, never a layer, never exported.
  referenceAssetId: z.string().uuid().nullable().optional(),
  // Denormalized at compose time; old creatives without it are 4:5. The layer
  // schema above only guards the union of all sizes (1080x1920); this refine
  // is what keeps a creative inside its own platform size.
  format: z.enum(SIZE_FORMATS).optional(),
  // Last template applied to this creative (keep in sync with TEMPLATE_IDS).
  // Optional so old creatives parse; the studio select shows it, so the
  // applied layout stays visible instead of silently resetting to placeholder.
  appliedTemplate: z.enum(['hero-center', 'split', 'minimal']).optional(),
}).strict().refine(creative => {
  const size = dimensionsFor(creative.format);
  return creative.layers.every(layer => layer.x + layer.width <= size.width + 0.01 && layer.y + layer.height <= size.height + 0.01);
}, 'creative_bounds');
export type Creative = z.infer<typeof creativeSchema>;
export function clampLayer(layer: EditableLayer, patch: Partial<EditableLayer>, dimensions = { width: 1080, height: 1350 }): EditableLayer {
  const next = { ...layer, ...patch };
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  next.width = Math.min(dimensions.width, Math.max(24, finite(next.width, layer.width)));
  next.height = Math.min(dimensions.height, Math.max(24, finite(next.height, layer.height)));
  next.x = Math.min(dimensions.width - next.width, Math.max(0, finite(next.x, layer.x)));
  next.y = Math.min(dimensions.height - next.height, Math.max(0, finite(next.y, layer.y)));
  next.fontSize = Math.min(160, Math.max(12, finite(next.fontSize, layer.fontSize)));
  return layerSchema.parse(next);
}
