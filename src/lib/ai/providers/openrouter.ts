import { z } from 'zod';
import { providers } from '../registry';
import { getProviderJson, type TransportOptions } from '../transport';
import { parseOpenAIList } from './shared';

export async function openRouterCatalog(apiKey: string, options: TransportOptions = {}) {
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  return parseOpenAIList(await getProviderJson(`${providers.openrouter.baseUrl}/models`, headers, options), 'openrouter');
}
export async function testOpenRouterKey(apiKey: string, options: TransportOptions = {}) {
  // /models can be public: a successful catalog response is not key validation.
  const data = await getProviderJson(`${providers.openrouter.baseUrl}/key`, { Authorization: `Bearer ${apiKey}` }, options);
  z.object({ data: z.object({ label: z.string().optional() }) }).parse(data);
}
