import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, vi } from 'vitest';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { newCampaign, planSchema, planRequestSchema, campaignSchema, MAX_PRODUCT_BYTES } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { saveCampaign, loadCampaigns } from '../../src/lib/campaign/repository';
import { buildPlanningPayload, geminiPlan, parsePlanningResponse } from '../../src/lib/ai/providers/gemini-planner';
import { handlePlanRequest } from '../../src/lib/ai/planning-server';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
function input() { const draft = newCampaign(); return planRequestSchema.parse({ providerId: 'gemini', apiKey: 'test-only-dummy-key', modelId: 'chosen-model', consent: true, imageConsent: true,
  brand: draft.brandSnapshot, brief: 'Promote the sample product honestly.', goal: 'awareness', creativeLanguage: 'en', format: '1080x1350', product: { mimeType: 'image/png', data: png } }); }
function response(plan = samplePlan(newCampaign())) { return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(plan) }] } }] }; }
function request(body: unknown, origin = 'https://app.test') { return new Request('https://app.test/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }); }
describe('campaign planner', () => {
  it('accepts the full advertised image size and rejects stale or incomplete approvals', () => {
    const body = input(); body.product.data = Buffer.alloc(MAX_PRODUCT_BYTES).toString('base64'); expect(planRequestSchema.safeParse(body).success).toBe(true);
    const draft = newCampaign(); draft.concepts = samplePlan(draft).concepts.map(item => ({ ...item, id: crypto.randomUUID(), approved: true }));
    expect(campaignSchema.safeParse(draft).success).toBe(false); draft.planRevision = draft.inputRevision;
    expect(campaignSchema.safeParse(draft).success).toBe(true); draft.concepts[0].caption = ''; expect(campaignSchema.safeParse(draft).success).toBe(false);
  });
  it('validates three distinct concepts in both creative languages', () => { for (const creativeLanguage of ['en', 'ar'] as const) expect(planSchema.parse(samplePlan({ ...newCampaign(), creativeLanguage })).concepts).toHaveLength(3); });
  it('rejects duplicate angles and duplicate copy', () => { const plan = samplePlan(newCampaign()); plan.concepts[1] = { ...plan.concepts[0] }; expect(planSchema.safeParse(plan).success).toBe(false); });
  it('ignores thinking parts and rejects truncated, blocked, malformed or extra fields', () => {
    const json = response(); json.candidates[0].content.parts.unshift({ text: 'not JSON' } as never);
    expect(() => parsePlanningResponse(json)).toThrow('plan_invalid');
    expect(() => parsePlanningResponse({ promptFeedback: { blockReason: 'SAFETY' } })).toThrow('plan_blocked');
    expect(() => parsePlanningResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] })).toThrow('plan_truncated');
    expect(() => parsePlanningResponse(response({ concepts: [{ ...samplePlan(newCampaign()).concepts[0], approved: true }] } as never))).toThrow('plan_invalid');
    expect(parsePlanningResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'private reasoning' }, ...response().candidates[0].content.parts] } }] }).concepts).toHaveLength(3);
  });
  it('sends the chosen model, key header, image and JSON schema to a fixed host once', async () => {
    const fetcher = vi.fn(async () => Response.json(response()));
    await geminiPlan(input(), { fetcher }); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/chosen-model:generateContent');
    expect(url).not.toContain(input().apiKey); expect(init.headers).toMatchObject({ 'x-goog-api-key': input().apiKey });
    const payload = JSON.parse(init.body as string); expect(payload.contents[0].parts[1].inlineData.data).toBe(png);
    expect(payload.generationConfig.responseJsonSchema.properties.concepts.minItems).toBe(3); expect(init.redirect).toBe('error');
    expect(JSON.stringify(buildPlanningPayload(input()))).not.toContain(input().apiKey);
  });
  it('never retries paid posts and maps quota without returning raw errors', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { status: 'RESOURCE_EXHAUSTED', message: input().apiKey } }, { status: 429 }));
    const result = await handlePlanRequest(request(input()), { fetcher }); expect(result.status).toBe(429);
    expect(await result.json()).toEqual({ error: { code: 'quota' } }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign origins, missing consent, endpoint injection and invalid images before fetching', async () => {
    const fetcher = vi.fn();
    for (const req of [request(input(), 'https://evil.test'), request({ ...input(), imageConsent: false }), request({ ...input(), baseUrl: 'http://localhost' }), request({ ...input(), modelId: '../models/hack' }), request({ ...input(), product: { mimeType: 'image/png', data: 'aGVsbG8=' } })]) {
      expect((await handlePlanRequest(req, { fetcher })).status).toBeGreaterThanOrEqual(400);
    } expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns a non-cacheable validated response and redacts known credentials from generated fields', async () => {
    const plan = samplePlan(newCampaign()); plan.concepts[0].caption += input().apiKey;
    const result = await handlePlanRequest(request(input()), { fetcher: async () => Response.json(response(plan)) });
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toContain('no-store'); expect(await result.text()).not.toContain(input().apiKey);
  });
  it('handles timeout and cancellation without a repeated request', async () => {
    const fetcher = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))));
    await expect(geminiPlan(input(), { fetcher, timeoutMs: 10 })).rejects.toMatchObject({ code: 'timeout' }); expect(fetcher).toHaveBeenCalledTimes(1);
    const abort = new AbortController(); abort.abort();
    await expect(geminiPlan(input(), { signal: abort.signal, fetcher: async () => { throw new Error('aborted'); } })).rejects.toMatchObject({ code: 'cancelled' });
  });
});
describe('campaign storage', () => {
  it('adds campaigns to a real version-one database without deleting brands, settings, credentials or assets', async () => {
    const name = `migration-${crypto.randomUUID()}`; const old = new Dexie(name);
    old.version(1).stores({ settings: 'key', brands: 'id, updatedAt', assets: 'id, kind, createdAt', modelCatalogCache: 'providerId, fetchedAt', encryptedCredentials: 'providerId' });
    await old.table('settings').put({ key: 'locale', value: 'ar' }); await old.table('brands').put({ id: 'brand', name: 'Existing' });
    await old.table('assets').put({ id: 'logo', kind: 'logo', blob: new Blob(['logo']) }); await old.table('encryptedCredentials').put({ providerId: 'gemini', ciphertext: [1] }); old.close();
    const db = new AdMorphDB(name);
    try { await db.open(); expect(db.verno).toBe(2); expect((await db.settings.get('locale'))?.value).toBe('ar'); expect(await db.brands.count()).toBe(1); expect(await db.assets.count()).toBe(1); expect(await db.encryptedCredentials.count()).toBe(1); expect(await db.campaigns.count()).toBe(0); }
    finally { await db.delete(); }
  });
  it('persists campaign edits and approvals, replaces only its product, and contains no key field', async () => {
    const db = new AdMorphDB(`campaign-${crypto.randomUUID()}`);
    try {
      const draft = newCampaign(); const asset = { id: crypto.randomUUID(), kind: 'product' as const, blob: new Blob(['product']), createdAt: draft.createdAt };
      draft.productAssetId = asset.id; draft.source = 'sample'; draft.planRevision = 0; draft.concepts = samplePlan(draft).concepts.map(item => ({ ...item, id: crypto.randomUUID(), approved: true }));
      await saveCampaign(draft, asset, db); const data = await loadCampaigns(db); expect(data.activeId).toBe(draft.id); expect(data.campaigns[0].concepts[0].approved).toBe(true); expect(data.assets).toHaveLength(1);
      const next = { ...asset, id: crypto.randomUUID() }; await saveCampaign({ ...draft, productAssetId: next.id }, next, db);
      expect(await db.assets.get(asset.id)).toBeUndefined(); expect(await db.assets.count()).toBe(1); expect(JSON.stringify(await db.campaigns.toArray())).not.toContain('apiKey');
    } finally { await db.delete(); }
  });
});
