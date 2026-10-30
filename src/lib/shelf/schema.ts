import { z } from 'zod';
import { metaBase, inputImage } from '../ai/meta-contracts';
import { brandInputSchema } from '../db/schema';
import { planDialectSchema } from '../campaign/dialects';

/**
 * "Shoot the shelf, get a campaign": Muse Spark finds every product on one
 * shelf photo (or the sharpest video frame), SAM 3.1 cuts each one out from
 * its box, and Muse Spark plans one ad per product in a single call.
 */
export const SHELF_MAX_PRODUCTS = 6;
export const shelfCategorySchema = z.enum(['food', 'beverage', 'beauty', 'fashion', 'electronics', 'home', 'other']);

export const shelfBoxSchema = z.object({
  left: z.number().min(0).max(1), top: z.number().min(0).max(1),
  right: z.number().min(0).max(1), bottom: z.number().min(0).max(1),
}).strict();

export const shelfDetectRequest = metaBase.extend({
  imageConsent: z.literal(true),
  image: inputImage,
  language: z.enum(['en', 'ar']),
}).strict();

/** Structured output: empty strings instead of optional fields, so the JSON schema stays strict. */
export const shelfDetectionSchema = z.object({
  products: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    category: shelfCategorySchema,
    box: shelfBoxSchema,
    /** The price exactly as written on a visible tag, or an empty string. */
    priceText: z.string().max(24),
  }).strict()).max(12),
}).strict();
export type ShelfDetection = z.infer<typeof shelfDetectionSchema>;
export type ShelfBox = z.infer<typeof shelfBoxSchema>;

export const shelfPlanRequest = metaBase.extend({
  brand: brandInputSchema,
  dialect: planDialectSchema,
  products: z.array(z.object({
    id: z.string().min(1).max(40),
    name: z.string().trim().min(1).max(60),
    category: shelfCategorySchema,
    priceText: z.string().max(24),
  }).strict()).min(1).max(SHELF_MAX_PRODUCTS),
}).strict();

export const shelfPlanSchema = z.object({
  campaignName: z.string().trim().min(1).max(60),
  products: z.array(z.object({
    id: z.string().min(1).max(40),
    headline: z.string().trim().min(1).max(60),
    cta: z.string().trim().min(1).max(24),
    scene: z.string().trim().min(10).max(400),
    caption: z.string().trim().min(1).max(400),
  }).strict()).min(1).max(SHELF_MAX_PRODUCTS),
}).strict();
export type ShelfPlan = z.infer<typeof shelfPlanSchema>;

/** Clean the detector's list: valid boxes only, tiny slivers dropped, at most SHELF_MAX_PRODUCTS, biggest first. */
export function cleanDetections(products: ShelfDetection['products']): ShelfDetection['products'] {
  return products
    .filter(item => item.box.right > item.box.left && item.box.bottom > item.box.top)
    .filter(item => (item.box.right - item.box.left) * (item.box.bottom - item.box.top) >= 0.004)
    .sort((a, b) => (b.box.right - b.box.left) * (b.box.bottom - b.box.top) - (a.box.right - a.box.left) * (a.box.bottom - a.box.top))
    .slice(0, SHELF_MAX_PRODUCTS);
}

export const SHELF_DETECT_PROMPT = 'This photo shows a shop shelf, counter or table with several products for sale. List each distinct product a shop owner would advertise, up to 8, the clearest first. For each one give: a short name a customer would use (copy the brand or product words printed on the pack when readable), its category, a tight bounding box as fractions of the image (left/top = top-left corner, right/bottom = bottom-right corner, each 0 to 1) around one whole unit of it, and its price exactly as written on a visible price tag next to it, or an empty string when no tag is readable. When the same product repeats, list it once and box its clearest unit. Ignore the shelf itself, hands, people, signs and background. Never invent prices. Answer only with the schema.';
