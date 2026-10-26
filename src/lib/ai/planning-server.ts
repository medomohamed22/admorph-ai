import { planRequestSchema, MAX_PRODUCT_BYTES } from '../campaign/schema';
import { ProviderError } from './errors';
import { geminiPlan } from './providers/gemini-planner';
import { readJsonLimited, type TransportOptions } from './transport';
import { validateLogo } from '../brand/backup';

export async function handlePlanRequest(request: Request, options: TransportOptions = {}) {
  const headers = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new ProviderError('origin', 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ProviderError('invalid_request', 415);
    let body;
    try { body = await readJsonLimited(request, 3 * 1024 * 1024); }
    catch (error) { throw new ProviderError('campaign_input', error instanceof ProviderError && error.status === 413 ? 413 : 400); }
    const parsed = planRequestSchema.safeParse(body);
    if (!parsed.success) throw new ProviderError('campaign_input');
    const input = parsed.data;
    const bytes = Buffer.from(input.product.data, 'base64');
    if (bytes.length > MAX_PRODUCT_BYTES) throw new ProviderError('product_size', 413);
    try { await validateLogo(new Blob([bytes], { type: input.product.mimeType })); }
    catch { throw new ProviderError('product_image'); }
    const result = await geminiPlan(input, { ...options, signal: request.signal });
    const scrub = (value: string) => value.split(input.apiKey).join('[redacted]');
    const concepts = result.concepts.map(concept => ({ ...concept, title: scrub(concept.title), audienceAngle: scrub(concept.audienceAngle),
      headline: scrub(concept.headline), caption: scrub(concept.caption), visualDirection: scrub(concept.visualDirection) }));
    return Response.json({ concepts }, { headers });
  } catch (error) {
    const safe = error instanceof ProviderError ? error : new ProviderError('plan_invalid', 502);
    return Response.json({ error: { code: safe.code } }, { status: safe.status, headers });
  }
}
