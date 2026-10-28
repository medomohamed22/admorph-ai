// AI reference image: a full ad render used as a style target ONLY. It is
// never exported and never becomes a layer — that is what keeps the
// product-integrity rule intact while the reference itself may redraw the
// product (it is generated from the product photo via the edits endpoint).
// The layout analysis below turns the reference into an approved,
// undoable template application — not an automatic rewrite.

import { z } from 'zod';
import { metaBase, inputImage } from './meta-contracts';
import { brandInputSchema } from '../db/schema';
import { TEMPLATE_IDS } from '../editor/templates';

export const referenceLayoutSchema = z.object({
  productZone: z.enum(['center', 'left', 'right', 'top', 'bottom']),
  headlineZone: z.enum(['center', 'left', 'right', 'top', 'bottom']),
  ctaZone: z.enum(['center', 'left', 'right', 'top', 'bottom']),
  suggestedTemplate: z.enum(TEMPLATE_IDS),
  notes: z.string().max(300),
}).strict();
export type ReferenceLayout = z.infer<typeof referenceLayoutSchema>;

export const referenceRequest = metaBase.extend({
  imageConsent: z.literal(true),
  image: inputImage,
  brand: brandInputSchema,
  headline: z.string().trim().min(1).max(120),
  visualDirection: z.string().trim().max(1000),
  scene: z.string().trim().max(200).optional(),
}).strict();

export function buildReferencePrompt(
  brand: { name: string; colors: readonly string[] },
  headline: string,
  visualDirection: string,
  scene?: string,
): string {
  return `Create one complete advertising image from this product photo: place the product in ${scene ?? 'a fitting scene'}, ${visualDirection}, brand ${brand.name} with colors ${brand.colors.join(', ')}. Compose it as a finished ad with a clear headline area and a call-to-action button. This image is a style reference only and will never be exported or used as the product.`;
}
