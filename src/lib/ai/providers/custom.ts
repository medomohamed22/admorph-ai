import { ProviderError } from '../errors';
import { getProviderJson, type TransportOptions } from '../transport';
import { parseOpenAIList } from './shared';

export function validateCustomBase(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch { throw new ProviderError('invalid_url'); }
}
export async function customCatalog(baseUrl: string, apiKey: string, options: TransportOptions = {}) {
  const base = validateCustomBase(baseUrl);
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  return parseOpenAIList(await getProviderJson(`${base}/models`, headers, { ...options, browserDirect: true }), 'custom');
}
