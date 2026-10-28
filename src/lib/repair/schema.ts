import { z } from 'zod';
import { creativeSchema } from '../editor/schema';
import { selectionSchema } from '../db/schema';
const id = z.string().uuid(), number = z.number().min(-10000).max(10000), color = z.string().regex(/^#[\da-f]{6}$/i);
export const repairActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move_layer'), layerId: id, x: number, y: number }).strict(),
  z.object({ type: z.literal('resize_layer'), layerId: id, width: number, height: number }).strict(),
  z.object({ type: z.literal('set_color'), layerId: id, color }).strict(),
  z.object({ type: z.literal('set_font_size'), layerId: id, fontSize: number }).strict(),
  z.object({ type: z.literal('set_text'), layerId: id, text: z.string().max(500) }).strict(),
  // Text layers already have an opaque rectangle; this changes that existing fill.
  z.object({ type: z.literal('add_backdrop'), layerId: id, color }).strict(),
  z.object({ type: z.literal('show_layer'), layerId: id }).strict(),
  // Resetting a forced direction to automatic is a text-layer-only repair.
  z.object({ type: z.literal('set_direction'), layerId: id, dir: z.enum(['auto', 'ltr', 'rtl']) }).strict(),
]);
export type RepairAction = z.infer<typeof repairActionSchema>;
export const repairResponseSchema = z.object({ rationale: z.string().trim().min(1).max(1200), actions: z.array(repairActionSchema).max(16) }).strict();
export const repairReceiptSchema = z.object({
  id, creativeId: id, appliedAt: z.string().datetime(), source: z.enum(['local', 'gemini', 'meta']), model: selectionSchema.nullable(),
  language: z.enum(['en', 'ar']), rationale: z.string().max(1200), actions: z.array(repairActionSchema).min(1).max(16),
  before: creativeSchema, after: creativeSchema, iteration: z.number().int().min(1).max(2), rootFingerprint: z.string().max(20000),
}).strict().refine(record => record.before.id === record.creativeId && record.after.id === record.creativeId && record.before.campaignId === record.after.campaignId && record.before.conceptId === record.after.conceptId, 'snapshot_identity');
export type RepairReceipt = z.infer<typeof repairReceiptSchema>;
