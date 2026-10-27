import {metaModelId} from './model-id';
import { z } from 'zod';
import { brandInputSchema } from '../db/schema';
import { conceptFieldsSchema } from '../campaign/schema';
import { ProviderError } from './errors';
import { type TransportOptions } from './transport';
export const backgroundRequestSchema = z.object({
  providerId: z.literal('meta'), modelId:metaModelId,
  apiKey: z.string().trim().min(1).max(4096).refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  consent: z.literal(true), approved: z.literal(true), brand: brandInputSchema, concept: conceptFieldsSchema,
}).strict();
export const MAX_BACKGROUND_BYTES = 3 * 1024 * 1024;
const imageResponse = z.object({ promptFeedback: z.object({ blockReason: z.string().optional() }).optional(), candidates: z.array(z.object({
  finishReason: z.string().optional(), content: z.object({ parts: z.array(z.object({ thought: z.boolean().optional(), inlineData: z.object({ mimeType: z.string(), data: z.string() }).optional() })).optional() }).optional(),
})).optional() });
export function decodeGeneratedImage(json: unknown) {
  const result = imageResponse.safeParse(json);
  if (!result.success) throw new ProviderError('image_response', 502);
  if (result.data.promptFeedback?.blockReason) throw new ProviderError('plan_blocked', 422);
  const candidate = result.data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') throw new ProviderError(candidate.finishReason === 'MAX_TOKENS' ? 'plan_truncated' : 'plan_blocked', 422);
  const part = candidate?.content?.parts?.find(part => !part.thought && part.inlineData)?.inlineData;
  if (!part || !['image/png', 'image/jpeg', 'image/webp'].includes(part.mimeType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(part.data)) throw new ProviderError('image_response', 502);
  const bytes = Buffer.from(part.data, 'base64');
  if (bytes.length > MAX_BACKGROUND_BYTES) throw new ProviderError('image_response', 502);
  return { bytes, mimeType: part.mimeType };
}
// Public handler: Meta only. Legacy parser helpers remain for historical data/tests.
export async function handleBackgroundRequest(request: Request, options: TransportOptions = {}) { return (await import('./meta-runtime')).handleMetaRoute(request, 'image', options); }
