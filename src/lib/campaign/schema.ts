import {metaModelId} from '../ai/model-id';
import { planDialectSchema } from './dialects';
import { z } from 'zod';
import { brandInputSchema } from '../db/schema';
import { selectionSchema } from '../db/schema';
import { SIZE_FORMATS } from '../editor/sizes';
import { artBriefSchema, artBriefToScene, avoidScenesSchema } from '../ai/art-brief';

export const MAX_PRODUCT_BYTES = 2 * 1024 * 1024;
export const goalSchema = z.enum(['awareness', 'consideration', 'conversion']);
export const angleSchema = z.enum(['offer', 'benefit', 'lifestyle']);
export const conceptFieldsSchema = z.object({
  angle: angleSchema, title: z.string().trim().min(1).max(100),
  audienceAngle: z.string().trim().min(1).max(240), headline: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(1200), copyLocale:z.enum(['ar_msa','ar_eg','ar_gulf','ar_lev','en_direct','en_genz','en_luxury']).optional(),ctaText:z.string().max(40).optional(), visualDirection: z.string().trim().min(1).max(1000), spatialPreset: z.enum(['top_copy_center_product','rtl_right_copy_left_product','ltr_left_copy_right_product','bottom_banner_center_stage']).optional(), negativeSpaceInstruction: z.string().max(600).optional(),
  artBrief: artBriefSchema.optional(),
}).strict();
// One to three concepts: the one-shot asks for three, a seasonal copy for one, variants for as many as the user picked.
export const planSchema = z.object({ concepts: z.array(conceptFieldsSchema).min(1).max(3), fonts: z.array(z.string().trim().min(1).max(60)).max(3).optional() }).strict().superRefine((value, ctx) => {
  const count = value.concepts.length;
  if (new Set(value.concepts.map(concept => concept.angle)).size !== count) ctx.addIssue({ code: 'custom', message: 'distinct_angles' });
  const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
  for (const field of ['title', 'headline', 'caption', 'visualDirection'] as const) {
    if (new Set(value.concepts.map(concept => normalize(concept[field]))).size !== count) ctx.addIssue({ code: 'custom', message: 'distinct_copy' });
  }
});
export type Plan = z.infer<typeof planSchema>;

/**
 * What Muse Spark writes for the one-shot ideas: only the fields the studio
 * uses, with limits small enough that the longest allowed answer still fits
 * the model's 4096-token output cap. The old wide schema (captions up to 1200
 * characters, a 1000-character visual direction, unused audience and spacing
 * notes) let a wordy answer run into the cap and fail the step, and an
 * optional art brief was sometimes skipped for one long paragraph. Named
 * offer/benefit/lifestyle fields make three distinct angles structural.
 */
const short = (max: number) => z.string().trim().min(1).max(max);
export const plannerBriefSchema = z.object({
  setting: short(160), props: z.array(short(60)).min(1).max(4), lighting: short(120), camera: short(100),
  composition: short(160), palette: z.array(short(40)).min(1).max(4), typeStyle: z.string().trim().max(100), avoid: z.array(short(60)).max(4),
}).strict();
export const plannerIdeaSchema = z.object({ title: short(60), headline: short(90), caption: short(400), artBrief: plannerBriefSchema }).strict();
export const PLANNER_ANGLES = ['offer', 'benefit', 'lifestyle'] as const;
/** The answer shape for 1 to 3 ideas: the first `count` angles, in order. Asking for one idea when one is used makes the answer a third as long. */
export function plannerOutputSchemaFor(count = 3) {
  const angles = PLANNER_ANGLES.slice(0, Math.min(3, Math.max(1, count)));
  return z.object({ ...Object.fromEntries(angles.map(angle => [angle, plannerIdeaSchema])), fonts: z.array(short(40)).max(3).optional() } as Record<string, z.ZodTypeAny>).strict().superRefine((value, ctx) => {
    const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, '');
    const ideas = angles.map(angle => value[angle] as PlannerIdea);
    for (const pick of [(idea: PlannerIdea) => idea.title, (idea: PlannerIdea) => idea.headline, (idea: PlannerIdea) => idea.caption, (idea: PlannerIdea) => idea.artBrief.setting + idea.artBrief.camera]) {
      if (new Set(ideas.map(idea => normalize(pick(idea)))).size !== ideas.length) { ctx.addIssue({ code: 'custom', message: 'distinct_copy' }); return; }
    }
  });
}
export const plannerOutputSchema = plannerOutputSchemaFor(3);
export type PlannerIdea = z.infer<typeof plannerIdeaSchema>;
export type PlannerOutput = Partial<Record<(typeof PLANNER_ANGLES)[number], PlannerIdea>> & { fonts?: string[] };
/** The planner's short answer in the plan shape the studio has always read. */
export function planFromPlannerOutput(output: PlannerOutput): Plan {
  const concepts = PLANNER_ANGLES.filter(angle => output[angle]).map(angle => {
    const idea = output[angle]!;
    return { angle, title: idea.title, audienceAngle: idea.title, headline: idea.headline, caption: idea.caption, visualDirection: artBriefToScene(idea.artBrief), artBrief: idea.artBrief };
  });
  return planSchema.parse({ concepts, ...(output.fonts?.length ? { fonts: output.fonts } : {}) });
}
export const editableConceptSchema = z.object({
  id: z.string().uuid(), angle: angleSchema, title: z.string().max(100), audienceAngle: z.string().max(240),
  headline: z.string().max(120), caption: z.string().max(1200), copyLocale:z.enum(['ar_msa','ar_eg','ar_gulf','ar_lev','en_direct','en_genz','en_luxury']).optional(),ctaText:z.string().max(40).optional(), visualDirection: z.string().max(1000), spatialPreset: z.enum(['top_copy_center_product','rtl_right_copy_left_product','ltr_left_copy_right_product','bottom_banner_center_stage']).optional(), negativeSpaceInstruction: z.string().max(600).optional(), approved: z.boolean(),
}).strict();
export type EditableConcept = z.infer<typeof editableConceptSchema>;
export type ConceptField = 'title' | 'audienceAngle' | 'headline' | 'caption' | 'visualDirection';
export const campaignSchema = z.object({
  id: z.string().uuid(), brandId: z.string().uuid().nullable(), brandSnapshot: brandInputSchema,
  productAssetId: z.string().uuid().nullable(), brief: z.string().max(2000), goal: goalSchema,
  creativeLanguage: z.enum(['en', 'ar']), format: z.enum(SIZE_FORMATS),
  concepts: z.array(editableConceptSchema).max(3), source: z.enum(['draft', 'sample', 'gemini', 'meta']),
  inputRevision: z.number().int().nonnegative(), planRevision: z.number().int().nonnegative().nullable(),
  originalProductAssetId: z.string().uuid().optional(), activeVariantId: z.string().uuid().nullable().optional(), planner: selectionSchema.nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  autoCutout: z.enum(['off','sam','local']).optional(),
}).strict().superRefine((campaign, ctx) => {
  if (campaign.concepts.length !== 0 && (campaign.concepts.length !== 3 || new Set(campaign.concepts.map(item => item.angle)).size !== 3)) ctx.addIssue({ code: 'custom', message: 'three_angles_required' });
  if (campaign.concepts.some(item => item.approved && (!canApprove(item) || campaign.planRevision !== campaign.inputRevision))) ctx.addIssue({ code: 'custom', message: 'invalid_approval' });
});
export type Campaign = z.infer<typeof campaignSchema>;
export const planRequestSchema = z.object({
  providerId: z.literal('meta'), apiKey: z.string().trim().min(1).max(4096).refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  modelId:metaModelId,
  consent: z.literal(true), imageConsent: z.literal(true), brand: brandInputSchema,
  brief: z.string().trim().max(2000).default(''), goal: goalSchema, creativeLanguage: z.enum(['en', 'ar']), format: z.enum(SIZE_FORMATS),
  /** Optional copy dialect; when present the planner writes every headline and caption in it. */
  dialect: planDialectSchema.optional(),
  /** Settings of the last few ads, so the planner picks a new place each time. */
  avoidScenes: avoidScenesSchema.optional(),
  /** A place the user typed; when present every idea is set there. */
  place: z.string().trim().min(1).max(120).optional(),
  /** How many ideas to write (default three); a seasonal copy needs one. */
  count: z.number().int().min(1).max(3).optional(),
  /** Light and mood looks picked at random on the device, one per idea, so ideas vary between runs and users. */
  looks: z.array(z.string().trim().min(1).max(120)).max(3).optional(),
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
    inputRevision: 0, planRevision: null, planner: null, autoCutout: 'off', createdAt: now, updatedAt: now };
}
export function canApprove(concept: EditableConcept): boolean {
  return conceptFieldsSchema.safeParse(({ angle: concept.angle, title: concept.title, audienceAngle: concept.audienceAngle,
    headline: concept.headline, caption: concept.caption, visualDirection: concept.visualDirection })).success;
}
