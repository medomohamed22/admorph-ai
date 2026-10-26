import { z } from 'zod';
import { planSchema, type PlanRequest } from './schema';
import { errorCodes, ProviderError } from '../ai/errors';
import { readJsonLimited } from '../ai/transport';
import { validateLogoDimensions, BrandError } from '../brand/backup';

export async function validateProduct(blob: Blob) {
  try { await validateLogoDimensions(blob); }
  catch (error) { throw new ProviderError(error instanceof BrandError ? error.code === 'logoSize' ? 'product_size' : error.code === 'logoDimensions' ? 'product_dimensions' : 'product_image' : 'product_image'); }
}
export async function encodeProduct(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { mimeType: blob.type as PlanRequest['product']['mimeType'], data: btoa(binary) };
}
export async function requestPlan(input: PlanRequest, signal: AbortSignal) {
  const deadline = AbortSignal.timeout(45000);
  try {
    const response = await fetch('/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.any([signal, deadline]), cache: 'no-store' });
    const body = await readJsonLimited(response, 200000);
    if (!response.ok) {
      const error = z.object({ error: z.object({ code: z.enum(errorCodes) }) }).safeParse(body);
      throw new ProviderError(error.success ? error.data.error.code : 'plan_invalid', response.status);
    }
    return planSchema.parse(body);
  } catch (error) {
    if (signal.aborted) throw new ProviderError('cancelled', 499);
    if (deadline.aborted) throw new ProviderError('timeout', 504);
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(error instanceof TypeError ? 'network' : 'plan_invalid', 502);
  }
}
