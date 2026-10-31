import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { handleMetaRoute } from '../../src/lib/ai/meta-runtime';
import { parseResearchResponse, firstJsonObject, safeSourceUrl, buildResearchPrompt, researchRequestSchema } from '../../src/lib/ai/research';

const answer = { productType: 'over-ear headphones', audience: 'remote workers', trends: [
  { name: 'Quiet desk editorial', visual: 'warm wood desk, morning window light', copy: 'calm, short promise', source: 'https://blog.example.com/a' },
  { name: 'Bold color block', visual: 'flat saturated backdrop, hard shadow', copy: 'punchy two-word lines' },
] };
const envelope = (text: string, extra: unknown[] = [], annotations: unknown[] = []) => ({ id: 'r1', output: [...extra, { type: 'message', content: [{ type: 'output_text', text, annotations }] }] });

describe('research response parsing', () => {
  it('reads the JSON answer, real citations and the search call', () => {
    const result = parseResearchResponse(envelope(`Here you go:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``, [{ type: 'web_search_call', status: 'completed' }], [{ type: 'url_citation', url: 'https://www.behance.net/x#frag', title: 'Behance' }, { type: 'url_citation', url: 'http://insecure.example.com' }]), true)!;
    expect(result.productType).toBe('over-ear headphones');
    expect(result.trends).toHaveLength(2);
    expect(result.searched).toBe(true);
    // Citations Meta attached win over URLs typed by the model; http and fragments are dropped.
    expect(result.sources).toEqual([{ url: 'https://www.behance.net/x', title: 'Behance' }]);
  });
  it('falls back to typed URLs only when a search ran, and shows none without a search', () => {
    const searched = parseResearchResponse(envelope(JSON.stringify(answer), [{ type: 'web_search_call' }]), true)!;
    expect(searched.sources).toEqual([{ url: 'https://blog.example.com/a' }]);
    const noSearch = parseResearchResponse(envelope(JSON.stringify(answer)), false)!;
    expect(noSearch.searched).toBe(false);
    expect(noSearch.sources).toEqual([]);
  });
  it('returns null for an answer without usable trends', () => {
    expect(parseResearchResponse(envelope('no json here'), true)).toBeNull();
    expect(parseResearchResponse(envelope(JSON.stringify({ productType: 'x', trends: [] })), true)).toBeNull();
    expect(parseResearchResponse({ nothing: true }, true)).toBeNull();
  });
  it('finds the first balanced object even with braces inside strings', () => {
    expect(firstJsonObject('pre {"a": "}{", "b": {"c": 1}} post {"d": 2}')).toEqual({ a: '}{', b: { c: 1 } });
  });
  it('only accepts public https pages', () => {
    expect(safeSourceUrl('https://pinterest.com/pin/1')).toBe('https://pinterest.com/pin/1');
    for (const bad of ['http://a.com', 'https://localhost/x', 'https://127.0.0.1/x', 'https://user:pw@a.com', 'javascript:alert(1)', 42]) expect(safeSourceUrl(bad)).toBeNull();
  });
  it('asks for styles, never copies, and adds the season and the directions to avoid', () => {
    const prompt = buildResearchPrompt({ language: 'ar', season: 'ramadan', avoid: ['Quiet desk editorial'] }, 2026);
    expect(prompt).toContain('2025-2026');
    expect(prompt).toContain('Ramadan');
    expect(prompt).toContain('never copy a specific brand');
    expect(prompt).toContain('"Quiet desk editorial"');
    expect(prompt).toContain('Arabic');
  });
});

describe('market research route', () => {
  const image = async () => ({ mimeType: 'image/png' as const, data: (await sharp({ create: { width: 24, height: 24, channels: 3, background: '#222' } }).png().toBuffer()).toString('base64') });
  const body = async () => ({ providerId: 'meta', apiKey: crypto.randomUUID(), modelId: 'muse-spark-1.3-contributor', consent: true, imageConsent: true, image: await image(), language: 'en' });
  const request = (value: unknown) => new Request('https://app.test/api/ai/market-research', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });

  it('sends the photo with the web_search tool and returns trends and sources', async () => {
    const fetcher = vi.fn(async () => Response.json(envelope(JSON.stringify(answer), [{ type: 'web_search_call' }], [{ type: 'url_citation', url: 'https://www.pinterest.com/p/1' }])));
    const response = await handleMetaRoute(request(await body()), 'market-research', { fetcher });
    expect(response.status).toBe(200);
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toContain('/responses');
    expect(sent.tools).toEqual([{ type: 'web_search' }]);
    expect(sent.input[0].content.map((part: { type: string }) => part.type)).toEqual(['input_text', 'input_image']);
    expect(await response.json()).toMatchObject({ searched: true, sources: [{ url: 'https://www.pinterest.com/p/1' }] });
  });
  it('asks once more without the tool when Meta refuses it, and says no search ran', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => ++calls === 1 ? Response.json({ error: { code: 'unsupported_task' } }, { status: 400 }) : Response.json(envelope(JSON.stringify(answer))));
    const response = await handleMetaRoute(request(await body()), 'market-research', { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body)).tools).toBeUndefined();
    expect(await response.json()).toMatchObject({ searched: false, sources: [] });
  });
  it('reports the envelope shape, never its content, when the answer cannot be read', async () => {
    const fetcher = vi.fn(async () => Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'secret prose only' }] }] }));
    const response = await handleMetaRoute(request(await body()), 'market-research', { fetcher });
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).toContain('item:message(output_text)');
    expect(text).not.toContain('secret prose');
  });
  it('rejects a request without image consent before any call', async () => {
    const fetcher = vi.fn();
    expect(researchRequestSchema.safeParse({ ...(await body()), imageConsent: false }).success).toBe(false);
    expect((await handleMetaRoute(request({ ...(await body()), imageConsent: false }), 'market-research', { fetcher })).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
