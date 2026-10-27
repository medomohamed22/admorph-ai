import {metaModelId} from '../ai/model-id';
import { z } from 'zod';
import { brandInputSchema } from '../db/schema';
import { selectionSchema } from '../db/schema';

export const MAX_PRODUCT_BYTES = 2 * 1024 * 1024;
export const goalSchema = z.enum(['awareness', 'consideration', 'conversion']);
export const angleSchema = z.enum(['offer', 'benefit', 'lifestyle']);
export const conceptFieldsSchema = z.object({
  angle: angleSchema, title: z.string().trim().min(1).max(100),
  audienceAngle: z.string().trim().min(1).max(240), headline: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(1200), copyLocale:z.enum(['ar_msa','ar_eg','ar_gulf','ar_lev','en_direct','en_genz','en_luxury']).optional(),ctaText:z.string().max(40).optional(), visualDirection: z.string().trim().min(1).max(1000), spatialPreset: z.enum(['top_copy_center_product','rtl_right_copy_left_product','ltr_left_copy_right_product','bottom_banner_center_stage']).optional(), negativeSpaceInstruction: z.string().max(600).optional(),
}).strict();
export const planSchema = z.object({ concepts: z.array(conceptFieldsSchema).length(3) }).strict().superRefine((value, ctx) => {
  if (new Set(value.concepts.map(concept => concept.angle)).size !== 3) ctx.addIssue({ code: 'custom', message: 'distinct_angles' });
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
  for (const field of ['title', 'headline', 'caption', 'visualDirection'] as const) {
    if (new Set(value.concepts.map(concept => normalize(concept[field]))).size !== 3) ctx.addIssue({ code: 'custom', message: 'distinct_copy' });
  }
});
export type Plan = z.infer<typeof planSchema>;
export const editableConceptSchema = z.object({
  id: z.string().uuid(), angle: angleSchema, title: z.string().max(100), audienceAngle: z.string().max(240),
  headline: z.string().max(120), caption: z.string().max(1200), copyLocale:z.enum(['ar_msa','ar_eg','ar_gulf','ar_lev','en_direct','en_genz','en_luxury']).optional(),ctaText:z.string().max(40).optional(), visualDirection: z.string().max(1000), spatialPreset: z.enum(['top_copy_center_product','rtl_right_copy_left_product','ltr_left_copy_right_product','bottom_banner_center_stage']).optional(), negativeSpaceInstruction: z.string().max(600).optional(), approved: z.boolean(),
}).strict();
export type EditableConcept = z.infer<typeof editableConceptSchema>;
export type ConceptField = 'title' | 'audienceAngle' | 'headline' | 'caption' | 'visualDirection';
export const campaignSchema = z.object({
  id: z.string().uuid(), brandId: z.string().uuid().nullable(), brandSnapshot: brandInputSchema,
  productAssetId: z.string().uuid().nullable(), brief: z.string().max(2000), goal: goalSchema,
  creativeLanguage: z.enum(['en', 'ar']), format: z.literal('1080x1350'),
  concepts: z.array(editableConceptSchema).max(3), source: z.enum(['draft', 'sample', 'gemini', 'meta']),
  inputRevision: z.number().int().nonnegative(), planRevision: z.number().int().nonnegative().nullable(),
  originalProductAssetId: z.string().uuid().optional(), activeVariantId: z.string().uuid().nullable().optional(), planner: selectionSchema.nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict().superRefine((campaign, ctx) => {
  if (campaign.concepts.length !== 0 && (campaign.concepts.length !== 3 || new Set(campaign.concepts.map(item => item.angle)).size !== 3)) ctx.addIssue({ code: 'custom', message: 'three_angles_required' });
  if (campaign.concepts.some(item => item.approved && (!canApprove(item) || campaign.planRevision !== campaign.inputRevision))) ctx.addIssue({ code: 'custom', message: 'invalid_approval' });
});
export type Campaign = z.infer<typeof campaignSchema>;
export const planRequestSchema = z.object({
  providerId: z.literal('meta'), apiKey: z.string().trim().min(1).max(4096).refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  modelId:metaModelId,
  consent: z.literal(true), imageConsent: z.literal(true), brand: brandInputSchema,
  brief: z.string().trim().min(8).max(2000), goal: goalSchema, creativeLanguage: z.enum(['en', 'ar']), format: z.literal('1080x1350'),
  product: z.object({ mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    data: z.string().min(4).max(4 * Math.ceil(MAX_PRODUCT_BYTES / 3)).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict(),
}).strict();
export type PlanRequest = z.infer<typeof planRequestSchema>;
export const SAMPLE_BRAND = { name: 'Sora', description: 'A sample ceremonial matcha brand focused on a calm daily ritual.',
  colors: ['#52633c', '#dce5bb', '#f2d1bc'] as [string, string, string] };
export function newCampaign(): Campaign {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), brandId: null, brandSnapshot: structuredClone(SAMPLE_BRAND), productAssetId: null,
    brief: '', goal: 'awareness', creativeLanguage: 'en', format: '1080x1350', concepts: [], source: 'draft',
    inputRevision: 0, planRevision: null, planner: null, createdAt: now, updatedAt: now };
}
export function canApprove(concept: EditableConcept): boolean {
  return conceptFieldsSchema.safeParse(({ angle: concept.angle, title: concept.title, audienceAngle: concept.audienceAngle,
    headline: concept.headline, caption: concept.caption, visualDirection: concept.visualDirection })).success;
}
