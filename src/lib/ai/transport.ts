import { ProviderError, httpError } from './errors';

export type Fetcher = typeof fetch;
export type TransportOptions = { fetcher?: Fetcher; signal?: AbortSignal; browserDirect?: boolean; timeoutMs?: number };

export async function readJsonLimited(source: Request | Response, limit = 4 * 1024 * 1024): Promise<unknown> {
  if (!source.body) throw new ProviderError('invalid_response', 502);
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ProviderError('invalid_response', 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('invalid_response', 502);
  } finally { reader.releaseLock(); }
}

export async function getProviderJson(url: string, headers: HeadersInit, options: TransportOptions = {}): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal?.aborted) throw new ProviderError('cancelled', 499);
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 12000);
    const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
    try {
      const response = await fetcher(url, {
        method: 'GET', headers, signal, redirect: 'error', cache: 'no-store',
        credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await response.body?.cancel();
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
          continue;
        }
        // Never forward upstream error bodies: they can echo credentials or request details.
        const error = httpError(response.status);
        if (response.status === 400 || response.status === 429) {
          const body = await readJsonLimited(response, 32 * 1024).catch(() => null);
          const serialized = JSON.stringify(body);
          if (serialized?.includes('API_KEY_INVALID')) throw new ProviderError('unauthorized', 401);
          if (serialized?.includes('RESOURCE_EXHAUSTED') || serialized?.includes('insufficient_quota')) {
            throw new ProviderError('quota', 429);
          }
        } else { await response.body?.cancel(); }
        throw error;
      }
      return await readJsonLimited(response);
    } catch (error) {
      if (options.signal?.aborted) throw new ProviderError('cancelled', 499);
      if (deadline.aborted) throw new ProviderError('timeout', 504);
      if (error instanceof ProviderError) throw error;
      if (attempt < 2) { await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1))); continue; }
      throw new ProviderError(options.browserDirect ? 'cors' : 'network', 502);
    }
  }
  throw new ProviderError('network', 502);
}
