import { describe, it, expect, vi } from 'vitest';
import { handleProviderRequest } from '../../src/lib/ai/server';
import { geminiCatalog } from '../../src/lib/ai/providers/gemini';
import { parseOpenAIList } from '../../src/lib/ai/providers/shared';
import { customCatalog, validateCustomBase } from '../../src/lib/ai/providers/custom';
import { getProviderJson } from '../../src/lib/ai/transport';
import { assertRole, canUseRole, filterModels } from '../../src/lib/ai/capabilities';
import { manualSelection } from '../../src/lib/ai/client';
import type { ProviderId } from '../../src/lib/ai/schemas';

// Synthetic fixtures only. No real keys, paid endpoints, or external requests.
const dummyKey = 'fixture-key-not-real';
const response = (body: unknown, status = 200) => Response.json(body, { status });
function request(body: unknown, origin = 'http://localhost:3000') {
  return new Request('http://localhost:3000/api/providers/models', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
}
const input = (providerId: ProviderId, apiKey = dummyKey) => ({ providerId, apiKey, consent: true });
const list = { data: [{ id: 'fixture/text', name: 'Text model', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
  { id: 'fixture/image', name: 'Image model', architecture: { input_modalities: ['text', 'image'], output_modalities: ['image'] }, available: true }] };

describe('Gemini adapter', () => {
  it('follows pagination, uses header auth and normalizes names and methods', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ models: [{ name: 'models/fixture-text', displayName: 'Fixture text', supportedGenerationMethods: ['generateContent'] }], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(response({ models: [{ name: 'models/fixture-embedding', supportedGenerationMethods: ['embedContent'] }] }));
    const result = await geminiCatalog(dummyKey, { fetcher });
    expect(result[0]).toMatchObject({ id: 'fixture-text', capabilities: ['text'], availability: 'unknown' });
    expect(result[1].capabilities).toEqual([]);
    expect(fetcher.mock.calls[1][0]).toContain('pageToken=page-2');
    for (const [url, options] of fetcher.mock.calls) {
      expect(String(url)).not.toContain(dummyKey);
      expect(options?.headers).toEqual({ 'x-goog-api-key': dummyKey });
      expect(options?.redirect).toBe('error');
      expect(options?.cache).toBe('no-store');
    }
  });
  it('does not infer image capability from an image-like model name', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ models: [{ name: 'models/fixture-image-generator', supportedGenerationMethods: ['generateContent'] }] }));
    expect((await geminiCatalog(dummyKey, { fetcher }))[0].capabilities).not.toContain('image_output');
  });
  it('labels method-only text candidates and respects explicit nontext output metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ models: [
      { name: 'models/provisional', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/audio-output', supportedGenerationMethods: ['generateContent'], outputModalities: ['audio'] },
    ] }));
    const models = await geminiCatalog(dummyKey, { fetcher });
    expect(models[0].capabilityEvidence).toBe('method_only');
    expect(models[1].capabilities).not.toContain('text');
  });
  it('rejects repeating pagination instead of reporting an incomplete success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ models: [], nextPageToken: 'same-page' }));
    await expect(geminiCatalog(dummyKey, { fetcher })).rejects.toMatchObject({ code: 'catalog_limit' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe('capabilities and roles', () => {
  const models = parseOpenAIList(list, 'openrouter');
  it('uses modality metadata rather than names', () => {
    const unknown = parseOpenAIList({ data: [{ id: 'image-vision-text-supermodel' }] }, 'meta');
    expect(unknown[0].capabilities).toEqual([]);
    expect(models[0].capabilities).toEqual(['text']);
    expect(models[1].capabilities).toEqual(['vision', 'image_output']);
  });
  it('rejects text-only and unavailable models for image output', () => {
    expect(() => assertRole(models[0], 'image')).toThrow('role_capability');
    expect(canUseRole(models[1], 'image')).toBe(true);
    expect(canUseRole({ ...models[1], availability: 'unavailable' }, 'image')).toBe(false);
    expect(() => assertRole(models[1], 'planner')).toThrow('role_capability');
  });
  it('filters search, modalities, and only provider-reported availability', () => {
    expect(filterModels(models, 'FIXTURE/TEXT', 'text', false)).toEqual([models[0]]);
    expect(filterModels(models, '', 'vision', false)).toEqual([models[1]]);
    expect(filterModels(models, '', 'all', true)).toEqual([models[1]]);
    expect(filterModels(models, 'missing', 'all', false)).toEqual([]);
  });
  it('manual fallback requires acknowledgement and never bypasses image safety', () => {
    expect(() => manualSelection('gemini', 'planner', 'unknown-model', false, [])).toThrow('manual_ack');
    expect(manualSelection('gemini', 'planner', 'models/unknown-model', true, [])).toEqual({ provider: 'gemini', modelId: 'unknown-model', manual: true });
    expect(() => manualSelection('gemini', 'image', 'unknown-model', true, [])).toThrow('role_capability');
    expect(() => manualSelection('openrouter', 'image', 'fixture/text', true, models)).toThrow('role_capability');
    expect(() => manualSelection('openrouter', 'planner', 'missing-provider', true, [])).toThrow('manual_id');
    expect(() => manualSelection('custom', 'planner', 'bad?key=secret', true, [])).toThrow('manual_id');
    const unknown = parseOpenAIList({ data: [{ id: 'metadata-omitted' }] }, 'meta');
    expect(manualSelection('meta', 'planner', 'metadata-omitted', true, unknown)).toMatchObject({ manual: true });
    expect(() => manualSelection('meta', 'image', 'metadata-omitted', true, unknown)).toThrow('role_capability');
  });
});

describe('official provider handlers', () => {
  it.each(['meta', 'gemini'] as const)('refuses %s without a key and never contacts upstream', async provider => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleProviderRequest(request(input(provider, '')), 'models', { fetcher });
    expect(result.status).toBe(400); expect(await result.json()).toEqual({ error: { code: 'missing_key' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { providerId: 'custom', apiKey: dummyKey, consent: true },
    { providerId: 'gemini', apiKey: dummyKey, consent: false },
    { providerId: 'gemini', apiKey: dummyKey, consent: true, baseUrl: 'https://attacker.invalid' },
    { providerId: 'unknown', apiKey: dummyKey, consent: true },
    { providerId: 'meta', apiKey: 'key\r\nInjected: value', consent: true },
  ])('rejects invalid, nonconsensual or arbitrary forwarding request %j', async body => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await handleProviderRequest(request(body), 'models', { fetcher });
    expect(result.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
    expect(await result.text()).not.toContain(dummyKey);
  });
  it('rejects cross-origin traffic and oversized input before upstream', async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await handleProviderRequest(request(input('meta'), 'https://elsewhere.invalid'), 'models', { fetcher })).status).toBe(403);
    expect((await handleProviderRequest(request({ ...input('meta'), padding: 'x'.repeat(17000) }), 'models', { fetcher })).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns a safe 400 for malformed JSON without echoing the request', async () => {
    const req = new Request('http://localhost:3000/api/providers/models', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: '{bad json' });
    const result = await handleProviderRequest(req, 'models');
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: { code: 'invalid_request' } });
  });
  it('normalizes Meta catalogs without inventing missing capabilities and disables response caching', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [{ id: 'returned-model' }, { id: 'returned-model' }] }));
    const result = await handleProviderRequest(request(input('meta')), 'test', { fetcher });
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toContain('no-store');
    const body = await result.json();
    expect(body.models).toHaveLength(1); expect(body.models[0].capabilities).toEqual([]);
    expect(body.credentialStatus).toBe('accepted');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.meta.ai/v1/models');
  });
  it('does not report public OpenRouter catalog success as key validation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(list));
    const result = await handleProviderRequest(request(input('openrouter', '')), 'models', { fetcher });
    expect((await result.json()).credentialStatus).toBe('not_tested');
    expect(fetcher.mock.calls[0][1]?.headers).toEqual({});
  });
  it('tests OpenRouter credentials on /key before listing and never generates', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ data: { label: 'Fixture' } })).mockResolvedValueOnce(response(list));
    const result = await handleProviderRequest(request(input('openrouter')), 'test', { fetcher });
    expect((await result.json()).credentialStatus).toBe('accepted');
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://openrouter.ai/api/v1/key', 'https://openrouter.ai/api/v1/models']);
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
  it.each([[401, 'unauthorized', 1], [403, 'forbidden', 1], [404, 'invalid_model', 1], [429, 'rate_limit', 3], [503, 'upstream', 3]] as const)('maps HTTP %i to %s and retries only transient errors', async (status, code, calls) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ error: { message: dummyKey } }, status));
    const result = await handleProviderRequest(request(input('meta')), 'models', { fetcher });
    expect(await result.json()).toEqual({ error: { code } });
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });
  it('maps Gemini key and quota reasons to actionable safe codes', async () => {
    for (const [upstreamCode, expected] of [['API_KEY_INVALID', 'unauthorized'], ['RESOURCE_EXHAUSTED', 'quota']]) {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response({ error: { message: `${dummyKey} ${upstreamCode}` } }, 400));
      const result = await handleProviderRequest(request(input('gemini')), 'test', { fetcher });
      expect(await result.json()).toEqual({ error: { code: expected } });
    }
  });
  it('rejects malformed upstream data without leaking keys or parser details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: dummyKey }));
    const result = await handleProviderRequest(request(input('meta')), 'models', { fetcher });
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: { code: 'invalid_response' } });
  });
  it('scrubs credentials even if upstream metadata echoes one', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ data: [{ id: 'fixture', description: dummyKey }] }));
    const result = await handleProviderRequest(request(input('meta')), 'models', { fetcher });
    expect(await result.text()).not.toContain(dummyKey);
  });
});

describe('custom direct connection and transport limits', () => {
  it.each(['http://example.com/v1', 'https://user:password@example.com', 'https://example.com?key=secret', 'https://example.com#fragment', 'not a url'])('refuses unsafe custom URL %s', url => {
    expect(() => validateCustomBase(url)).toThrow('invalid_url');
  });
  it('normalizes custom HTTPS paths and uses browser-direct credentials without redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(list));
    await customCatalog('https://example.com/v1///', dummyKey, { fetcher });
    expect(fetcher.mock.calls[0][0]).toBe('https://example.com/v1/models');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${dummyKey}` } });
  });
  it('provides a CORS/network hint after bounded custom retries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(dummyKey));
    await expect(customCatalog('https://example.com/v1', dummyKey, { fetcher })).rejects.toMatchObject({ code: 'cors' });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('supports cancellation without starting a fetch', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(getProviderJson('https://example.com', {}, { signal: controller.signal, fetcher })).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('bounds slow provider requests with an actionable timeout', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('abort')), { once: true });
    }));
    await expect(getProviderJson('https://example.com', {}, { fetcher, timeoutMs: 5 })).rejects.toMatchObject({ code: 'timeout' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
