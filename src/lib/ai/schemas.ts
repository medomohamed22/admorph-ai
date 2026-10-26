import { z } from 'zod';

export const providerIdSchema = z.enum(['meta', 'gemini', 'openrouter', 'custom']);
export type ProviderId = z.infer<typeof providerIdSchema>;
export const capabilitySchema = z.enum(['text', 'vision', 'image_output', 'structured_output']);
export type ModelCapability = z.infer<typeof capabilitySchema>;
export const modelSchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().max(300),
  provider: providerIdSchema,
  capabilities: z.array(capabilitySchema),
  capabilityEvidence: z.enum(['metadata', 'method_only', 'unknown']).optional(),
  description: z.string().max(4000).optional(),
  contextWindow: z.number().nonnegative().optional(),
  availability: z.enum(['available', 'unavailable', 'unknown']),
});
export type ModelInfo = z.infer<typeof modelSchema>;
export const catalogSchema = z.object({
  models: z.array(modelSchema).max(5000),
  fetchedAt: z.string().datetime(),
  credentialStatus: z.enum(['accepted', 'not_tested', 'endpoint_only']),
  cached: z.boolean().optional(),
});
export type Catalog = z.infer<typeof catalogSchema>;
export function redactCatalog(catalog: Catalog, key: string): Catalog {
  if (!key) return catalog;
  const scrub = (value: string) => value.split(key).join('[redacted]');
  return { ...catalog, models: catalog.models.map(model => ({ ...model, id: scrub(model.id), name: scrub(model.name),
    description: model.description === undefined ? undefined : scrub(model.description) })) };
}
export type ModelRole = 'planner' | 'image' | 'critic' | 'edit';
export const roles: ModelRole[] = ['planner', 'image', 'critic', 'edit'];
export type ModelSelection = { provider: ProviderId; modelId: string; manual?: boolean };
export type RoleSelection = Record<ModelRole, ModelSelection | null>;
export const emptyRoles = (): RoleSelection => ({ planner: null, image: null, critic: null, edit: null });

export const providerRequestSchema = z.object({
  providerId: providerIdSchema,
  apiKey: z.string().trim().max(4096).refine(value => !/[\r\n\x00-\x1f\x7f]/.test(value)),
  consent: z.literal(true),
}).strict();

// Accept standard OpenAI-like fields without treating model names as capability evidence.
export const rawModelSchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().max(300).optional(),
  description: z.string().max(4000).nullish(),
  context_length: z.number().nonnegative().nullish(),
  input_modalities: z.array(z.string()).optional(),
  output_modalities: z.array(z.string()).optional(),
  architecture: z.object({
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
  }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  available: z.boolean().optional(),
});
export type RawModel = z.infer<typeof rawModelSchema>;
export const openAIListSchema = z.object({ data: z.array(rawModelSchema).max(5000) });
