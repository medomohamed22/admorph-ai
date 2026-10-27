import { ProviderError } from './errors';
import { catalogSchema, providerRequestSchema, redactCatalog, type Catalog } from './schemas';
import { metaCatalog } from './providers/meta';
import { readJsonLimited, type TransportOptions } from './transport';

export async function providerRequest(request: Request, action: 'models' | 'test', options: TransportOptions = {}): Promise<Catalog> {
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new ProviderError('origin', 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ProviderError('invalid_request', 415);
  let json;
  try { json = await readJsonLimited(request, 16000); }
  catch (error) {
    if (error instanceof ProviderError && error.status === 413) throw error;
    throw new ProviderError('invalid_request');
  }
  const body = providerRequestSchema.safeParse(json);
  if (!body.success) throw new ProviderError('invalid_request');
  const { providerId, apiKey } = body.data;
  if (providerId !== 'meta') throw new ProviderError('meta_only');
  if(!apiKey)throw new ProviderError('missing_key');
  const deadline=AbortSignal.timeout(60000),transport={...options,timeoutMs:options.timeoutMs??30000,signal:AbortSignal.any([request.signal,options.signal??new AbortController().signal,deadline])};
  const models=await metaCatalog(apiKey,transport);
  const deduped = Array.from(new Map(models.map(model => [model.id, model])).values());
  const result = catalogSchema.parse({ models: deduped, fetchedAt: new Date().toISOString(),
    credentialStatus: 'accepted' });
  // Catalogs are metadata, but never let an upstream echo a supplied credential back to the browser.
  return redactCatalog(result, apiKey);
}

export async function handleProviderRequest(request: Request, action: 'models' | 'test', options: TransportOptions = {}) {
  const headers = { 'Cache-Control': 'no-store, private', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  try { return Response.json(await providerRequest(request, action, options), { headers }); }
  catch (error) {
    const known = error instanceof ProviderError ? error : new ProviderError('invalid_response', 502);
    return Response.json({ error: { code: known.code } }, { status: known.status, headers });
  }
}
