import { z } from 'zod';
import { metadataCapabilities } from '../capabilities';
import { ProviderError } from '../errors';
import { getProviderJson, type TransportOptions } from '../transport';
import { providers } from '../registry';
import type { ModelInfo } from '../schemas';

const pageSchema = z.object({
  models: z.array(z.object({
    name: z.string().min(1).max(240), displayName: z.string().max(300).optional(),
    description: z.string().max(4000).optional(), inputTokenLimit: z.number().nonnegative().optional(),
    supportedGenerationMethods: z.array(z.string()).optional(),
    inputModalities: z.array(z.string()).optional(), outputModalities: z.array(z.string()).optional(),
  })).max(1000).default([]),
  nextPageToken: z.string().max(4096).optional(),
});

export async function geminiCatalog(apiKey: string, options: TransportOptions = {}): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${providers.gemini.baseUrl}/models`);
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = pageSchema.parse(await getProviderJson(url.href, { 'x-goog-api-key': apiKey }, options));
    for (const raw of data.models) {
      const capabilities = metadataCapabilities({ id: raw.name, input_modalities: raw.inputModalities, output_modalities: raw.outputModalities });
      // The list API often omits output modalities. generateContent makes a model a
      // provisional text candidate, not proof of a text-only or image-capable output.
      const methodOnly = !raw.outputModalities && raw.supportedGenerationMethods?.includes('generateContent');
      if (methodOnly && !capabilities.includes('text')) capabilities.push('text');
      models.push({ id: raw.name.replace(/^models\//, ''), name: raw.displayName ?? raw.name,
        provider: 'gemini', capabilities, capabilityEvidence: methodOnly ? 'method_only' : capabilities.length ? 'metadata' : 'unknown',
        description: raw.description, contextWindow: raw.inputTokenLimit,
        availability: 'unknown' });
    }
    if (models.length > 5000) throw new ProviderError('catalog_limit', 502);
    pageToken = data.nextPageToken;
    if (!pageToken) return models;
    if (seen.has(pageToken)) throw new ProviderError('catalog_limit', 502);
    seen.add(pageToken);
  }
  throw new ProviderError('catalog_limit', 502);
}
