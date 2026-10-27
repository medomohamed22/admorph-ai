import {metaModelId} from './model-id';
import { z } from 'zod';
export const metaSmokeRequestSchema = z.object({ apiKey: z.string().trim().min(1).max(4096).refine(value => !/[\x00-\x1f\x7f]/.test(value)),
  providerId: z.literal('meta'), modelId:metaModelId, kind: z.enum(['text', 'image']), consent: z.literal(true) }).strict();
export const metaTextSmokeSchema = z.object({ kind: z.literal('text'), source: z.enum(['live', 'fixture']), modelId: z.string().max(240), checkedAtUTC: z.string().datetime(), reply: z.literal('ready'), requestId: z.string().max(200).nullable() }).strict();
