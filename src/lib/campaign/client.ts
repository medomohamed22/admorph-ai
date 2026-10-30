import {metaFetch} from '@/lib/ai/meta-fetch';
import { z } from 'zod';
import { planSchema, type PlanRequest } from './schema';
import { errorCodes, ProviderError } from '../ai/errors';
import { readJsonLimited } from '../ai/transport';
import { validateLogoDimensions, BrandError } from '../brand/backup';

export async function validateProduct(blob: Blob) {
  try { await validateLogoDimensions(blob); }
  catch (error) { throw new ProviderError(error instanceof BrandError ? error.code === 'logoSize' ? 'product_size' : error.code === 'logoDimensions' ? 'product_dimensions' : 'product_image' : 'product_image'); }
}
const GENERATED_IMAGE_LIMIT = 2 * 1024 * 1024;
/** Generated results are not user uploads: the 2 MB upload cap must not
 * reject a Meta edit or a local sample filter. Still require a decodable
 * image within the 4096 px dimension limit. */
export async function validateGeneratedImage(blob: Blob) {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new ProviderError('product_image', 422); }
  const { width, height } = bitmap; bitmap.close();
  if (width > 4096 || height > 4096) throw new ProviderError('product_dimensions', 422);
}
async function encodeFit(blob: Blob, maxSide: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no_canvas');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (webp) return webp;
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (jpeg) return jpeg;
    throw new Error('encode_failed');
  } finally { bitmap.close(); }
}
/** Fit an accepted variant back under the 2 MB product cap so later Meta
 * calls that send the product (planner, vision) still pass the server's
 * 2 MiB input limit. The comparison still shows the original variant;
 * only the stored product is the fitted equivalent. Returns the input
 * unchanged when it already fits, else the smallest fitted attempt. */
export async function fitProductImage(blob: Blob): Promise<Blob> {
  if (blob.size <= GENERATED_IMAGE_LIMIT) return blob;
  const attempts = [
    { maxSide: Number.POSITIVE_INFINITY, quality: 0.9 },
    { maxSide: 1600, quality: 0.85 },
    { maxSide: 1024, quality: 0.8 },
    { maxSide: 768, quality: 0.75 },
  ];
  let smallest = blob;
  for (const attempt of attempts) {
    try {
      const next = await encodeFit(blob, attempt.maxSide, attempt.quality);
      if (next.size < smallest.size) smallest = next;
      if (next.size <= GENERATED_IMAGE_LIMIT) return next;
    } catch { /* try the next attempt */ }
  }
  return smallest;
}
export async function encodeProduct(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { mimeType: blob.type as PlanRequest['product']['mimeType'], data: btoa(binary) };
}
export async function requestPlan(input: PlanRequest, signal: AbortSignal) {
  const deadline = AbortSignal.timeout(65000);
  try {
    const response = await metaFetch('planner','/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' },
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
