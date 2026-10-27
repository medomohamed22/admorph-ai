import { z } from 'zod';
import { ProviderError, errorCodes } from './errors';
import { catalogSchema, type ModelInfo, type ModelRole, type ProviderId, type ModelSelection } from './schemas';
import { assertRole } from './capabilities';
import { readJsonLimited } from './transport';

export async function fetchCatalog(input: { providerId: ProviderId; apiKey: string; baseUrl: string; consent: boolean }, action: 'models' | 'test', signal: AbortSignal) {
  if (!input.consent) throw new ProviderError('consent');
  if (/[\r\n\x00-\x1f\x7f]/.test(input.apiKey.trim())) throw new ProviderError('invalid_request');
  if(input.providerId!=='meta')throw new ProviderError('meta_only');
  const deadline = AbortSignal.timeout(65000);
  try {
    const response = await fetch(`/api/providers/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.any([signal, deadline]), cache: 'no-store',
      body: JSON.stringify({ providerId: input.providerId, apiKey: input.apiKey.trim(), consent: true }),
    });
    const json = await readJsonLimited(response);
    if (!response.ok) {
      const parsed = z.object({ error: z.object({ code: z.enum(errorCodes) }) }).safeParse(json);
      throw new ProviderError(parsed.success ? parsed.data.error.code : 'network', response.status);
    }
    return catalogSchema.parse(json);
  } catch (error) {
    if (signal.aborted) throw new ProviderError('cancelled', 499);
    if (deadline.aborted) throw new ProviderError('timeout', 504);
    if (error instanceof ProviderError) throw error;
    if (error instanceof TypeError) throw new ProviderError('network', 502);
    throw new ProviderError('invalid_response', 502);
  }
}

export function manualSelection(provider: ProviderId, role: ModelRole, rawId: string, acknowledged: boolean, models: ModelInfo[]): ModelSelection {
  const id = (provider === 'gemini' ? rawId.trim().replace(/^models\//, '') : rawId.trim());
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,239}$/.test(id) || (provider === 'openrouter' && !id.includes('/'))) throw new ProviderError('manual_id');
  const known = models.find(model => model.id === id&&model.provider===provider);
  if(provider==='meta'){if(!acknowledged)throw new ProviderError('manual_ack');if(known?.availability==='unavailable')throw new ProviderError('role_capability');return {provider,modelId:id,manual:true};}
  if (known && (known.capabilities.length || known.availability === 'unavailable')) {
    assertRole(known, role); return { provider, modelId: id };
  }
  if (role === 'image') throw new ProviderError('role_capability');
  if (!acknowledged) throw new ProviderError('manual_ack');
  return { provider, modelId: id, manual: true };
}
