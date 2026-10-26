import { providers } from '../registry';
import { getProviderJson, type TransportOptions } from '../transport';
import { parseOpenAIList } from './shared';

export async function metaCatalog(apiKey: string, options: TransportOptions = {}) {
  const data = await getProviderJson(`${providers.meta.baseUrl}/models`, { Authorization: `Bearer ${apiKey}` }, options);
  return parseOpenAIList(data, 'meta');
}
