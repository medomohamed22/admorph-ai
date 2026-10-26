import { z } from 'zod';
import { catalogSchema, providerIdSchema } from '../ai/schemas';

export const hexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(500),
  colors: z.tuple([hexSchema, hexSchema, hexSchema]),
}).strict();
export type BrandInput = z.infer<typeof brandInputSchema>;
export const brandSchema = brandInputSchema.extend({
  id: z.string().uuid(), logoAssetId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();
export type Brand = z.infer<typeof brandSchema>;
export type Asset = { id: string; kind: 'logo'; blob: Blob; createdAt: string };
export const selectionSchema = z.object({ provider: providerIdSchema, modelId: z.string().min(1).max(240), manual: z.boolean().optional() }).strict();
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
  providerId: providerIdSchema, version: z.literal(1),
  baseUrl: z.string().max(2048),
  iterations: z.literal(310000),
  salt: z.array(z.number().int().min(0).max(255)).length(16),
  iv: z.array(z.number().int().min(0).max(255)).length(12),
  ciphertext: z.array(z.number().int().min(0).max(255)).min(17).max(17000),
}).strict();
export type EncryptedCredential = z.infer<typeof encryptedCredentialSchema>;
