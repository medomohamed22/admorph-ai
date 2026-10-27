import { z } from 'zod';
import { selectionSchema } from '../db/schema';
export const layerSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['background', 'product', 'logo', 'headline', 'brand', 'cta']),
  x: z.number().min(0).max(1080), y: z.number().min(0).max(1350), width: z.number().min(24).max(1080), height: z.number().min(24).max(1350),
  text: z.string().max(500), color: z.string().regex(/^#[\da-f]{6}$/i), fill: z.union([z.string().regex(/^#[\da-f]{6}$/i), z.literal('transparent')]),
  fontFamily: z.enum(['Inter', 'Cairo']), fontSize: z.number().min(12).max(160),
  opacity: z.number().min(0).max(1).optional(), visible: z.boolean(), assetId: z.string().uuid().nullable(),
}).strict().refine(layer => layer.x + layer.width <= 1080.01 && layer.y + layer.height <= 1350.01, 'layer_bounds');
export type EditableLayer = z.infer<typeof layerSchema>;
export const creativeSchema = z.object({
  id: z.string().uuid(), campaignId: z.string().uuid(), conceptId: z.string().uuid(),
  layers: z.array(layerSchema).min(1).max(10), caption: z.string().max(1200),
  source: z.enum(['composition', 'local', 'gemini', 'meta']), model: selectionSchema.nullable(),
  placement: z.enum(['off','feed','reels']).optional(), inputRevision: z.number().int().nonnegative(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();
export type Creative = z.infer<typeof creativeSchema>;
export function clampLayer(layer: EditableLayer, patch: Partial<EditableLayer>): EditableLayer {
  const next = { ...layer, ...patch };
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  next.width = Math.min(1080, Math.max(24, finite(next.width, layer.width)));
  next.height = Math.min(1350, Math.max(24, finite(next.height, layer.height)));
  next.x = Math.min(1080 - next.width, Math.max(0, finite(next.x, layer.x)));
  next.y = Math.min(1350 - next.height, Math.max(0, finite(next.y, layer.y)));
  next.fontSize = Math.min(160, Math.max(12, finite(next.fontSize, layer.fontSize)));
  return layerSchema.parse(next);
}
