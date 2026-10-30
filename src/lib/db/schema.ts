import { z } from 'zod';
import { catalogSchema, providerIdSchema } from '../ai/schemas';
import {logoPlacementSchema} from '../editor/logo-placement';

export const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  colors: z.tuple([hexSchema, hexSchema, hexSchema]),
  logoPlacement:logoPlacementSchema.optional(),logoAspectRatio:z.number().positive().max(1000).optional(),brandTone:z.string().max(120).optional(),shortDescriptionEn:z.string().max(500).optional(),shortDescriptionAr:z.string().max(500).optional(),recommendedFontEn:z.literal('Inter').optional(),recommendedFontAr:z.literal('Cairo').optional(),wordmarkStyle:z.string().max(200).optional(),wordmarkBold:z.boolean().optional(),
}).strict();
export type BrandInput = z.infer<typeof brandInputSchema>;
export const brandSchema = brandInputSchema.extend({
  id: z.string().uuid(), logoAssetId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();
export type Brand = z.infer<typeof brandSchema>;
export type Asset = { id: string; kind: 'logo' | 'product' | 'background' | 'cutout' | 'reference'; blob: Blob; createdAt: string; meta?: { derivedFrom?: string; provider?: 'local' | 'meta-sam'; sourceWidth?: number; sourceHeight?: number; reliable?: boolean } };
/** A finished ad image saved to the project's gallery, so the remix pages
 *  (variants, themes) can pick it as a source without re-uploading. */
/** `cutout` keeps the product cutout the ad was painted from, so variants and seasons can redesign from the product instead of repainting the finished ad. */
export type SavedAd = { id: string; blob: Blob; source: 'oneshot' | 'variants' | 'themes' | 'shelf'; brand: BrandInput; headline: string; hasLogo: boolean; createdAt: string; cutout?: Blob };
export const selectionSchema = z.object({ provider: providerIdSchema, modelId: z.string().min(1).max(240), manual: z.boolean().optional(), imageCapabilityConfirmed: z.boolean().optional() }).strict();
export const rolesSchema = z.object({ planner: selectionSchema.nullable(), image: selectionSchema.nullable(), critic: selectionSchema.nullable(), edit: selectionSchema.nullable() }).strict();
export const savedSettingsSchema = z.object({
  provider: providerIdSchema,
  customBaseUrl: z.string().max(2048),
  roles: rolesSchema,
}).strict();
export type SavedSettings = z.infer<typeof savedSettingsSchema>;
export const cacheSchema = z.object({ providerId: providerIdSchema, models: catalogSchema.shape.models, fetchedAt: z.string().datetime() }).strict();
export type CatalogCache = z.infer<typeof cacheSchema>;
export type Setting = { key: string; value: unknown };

export const encryptedCredentialSchema = z.object({
  providerId: providerIdSchema, version: z.union([z.literal(1),z.literal(2)]),
  baseUrl: z.string().max(2048),
  iterations: z.union([z.literal(310000),z.literal(600000)]),
  salt: z.array(z.number().int().min(0).max(255)).length(16),
  iv: z.array(z.number().int().min(0).max(255)).length(12),
  ciphertext: z.array(z.number().int().min(0).max(255)).min(17).max(17000),
}).strict().refine(record=>record.version===1?record.iterations===310000:record.iterations===600000,'kdf_version');
export type EncryptedCredential = z.infer<typeof encryptedCredentialSchema>;
