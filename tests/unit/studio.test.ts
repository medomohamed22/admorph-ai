import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import Dexie from 'dexie';
import { it, expect, describe, vi,beforeEach } from 'vitest';
import { compose } from '../../src/lib/editor/composition';
import { clampLayer, creativeSchema } from '../../src/lib/editor/schema';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { loadCreative, saveCreative } from '../../src/lib/editor/repository';
import { backgroundRequestSchema, handleBackgroundRequest } from '../../src/lib/ai/image-server';
import { confirmedImage } from '../../src/lib/ai/capabilities';

let testKey='';beforeEach(()=>{testKey=crypto.randomUUID();});
function fixture() { const campaign = newCampaign(), concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true }; return { campaign, concept }; }
function input() { const { campaign, concept } = fixture(); const { id: _id, approved: _approved, ...fields } = concept; void _id; void _approved;
  return backgroundRequestSchema.parse({ providerId: 'meta', apiKey:testKey, modelId: 'chosen-image-model', consent: true, approved: true, brand: campaign.brandSnapshot, concept: fields }); }
function request(body: unknown, origin = 'https://app.test') { return new Request('https://app.test/api/ai/background', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
describe('editable creative data', () => {
  it('composes independent product/logo/text/CTA layers and supports Arabic fonts', () => {
    const { campaign, concept } = fixture(); campaign.creativeLanguage = 'ar';
    const creative = compose(campaign, concept, crypto.randomUUID(), crypto.randomUUID());
    expect(creativeSchema.safeParse(creative).success).toBe(true); expect(creative.layers).toHaveLength(6);
    expect(creative.layers.find(layer => layer.kind === 'headline')?.fontFamily).toBe('Cairo'); expect(creative.layers.find(layer => layer.kind === 'cta')?.text).toBe('اكتشف المزيد');
  });
  it('clamps drag/resize coordinates and rejects unsafe layer fields', () => {
    const { campaign, concept } = fixture(), layer = compose(campaign, concept, crypto.randomUUID(), null).layers[2];
    const result = clampLayer(layer, { x: -90, y: 5000, width: 9999, fontSize: Infinity });
    expect(result.x).toBe(0); expect(result.width).toBe(1080); expect(result.y + result.height).toBe(1350); expect(result.fontSize).toBe(layer.fontSize);
    expect(() => clampLayer(layer, { fontFamily: 'untrusted font' as never })).toThrow();
  });
  it('persists editable layers and Blobs atomically and leaves old backgrounds intact', async () => {
    const db = new AdMorphDB(`creative-${crypto.randomUUID()}`);
    try {
      const { campaign, concept } = fixture(), asset = { id: crypto.randomUUID(), kind: 'product' as const, blob: new Blob(['photo']), createdAt: new Date().toISOString() };
      const creative = compose(campaign, concept, asset.id, null); await saveCreative(creative, [asset], db);
      const result = await loadCreative(campaign.id, concept.id, db); expect(result?.creative.layers).toEqual(creative.layers); expect(result?.assets).toHaveLength(1);
      const missing = { ...creative, layers: creative.layers.map(layer => layer.kind === 'product' ? { ...layer, assetId: crypto.randomUUID() } : layer) };
      await expect(saveCreative(missing, [], db)).rejects.toThrow('missing_asset'); expect((await db.creatives.get(creative.id))?.layers).toEqual(creative.layers);
    } finally { await db.delete(); }
  });
  it('upgrades version two while preserving campaign and previous settings', async () => {
    const name = `studio-upgrade-${crypto.randomUUID()}`, old = new Dexie(name);
    old.version(2).stores({ settings: 'key', brands: 'id, updatedAt', assets: 'id, kind, createdAt', modelCatalogCache: 'providerId, fetchedAt', encryptedCredentials: 'providerId', campaigns: 'id, brandId, updatedAt' });
    const campaign = newCampaign(); await old.table('campaigns').put(campaign); await old.table('settings').put({ key: 'locale', value: 'ar' }); old.close();
    const db = new AdMorphDB(name); try { await db.open(); expect(db.verno).toBe(7); expect(await db.campaigns.get(campaign.id)).toEqual(campaign); expect((await db.settings.get('locale'))?.value).toBe('ar'); expect(await db.creatives.count()).toBe(0); } finally { await db.delete(); }
  });
  it('requires explicit image confirmation and never overrides known text-only metadata', () => {
    const selected = { provider: 'meta' as const, modelId: 'user-model', manual: true, imageCapabilityConfirmed: true };
    expect(confirmedImage(selected)).toBe(true); expect(confirmedImage({ ...selected, imageCapabilityConfirmed: false })).toBe(false);
    expect(confirmedImage(selected, { id: 'user-model', name: 'Text', provider: 'gemini', capabilities: ['text'], capabilityEvidence: 'metadata', availability: 'available' })).toBe(false);
  });
});
describe('background adapter', () => {
  it('sends one fixed-host request with chosen model, no keys in prompt, and returns a verified raster', async () => {
    const bytes = await readFile('public/demo/sora-product.png'), fetcher = vi.fn(async () => Response.json({data:[{b64_json:bytes.toString('base64')}]}));
    const result = await handleBackgroundRequest(request(input()), { fetcher }); expect(result.status).toBe(200); expect(result.headers.get('content-type')).toBe('image/png'); expect(result.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await result.arrayBuffer())).toEqual(bytes); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, config] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toBe('https://api.meta.ai/v1/images/generations');
    expect(config.headers).toMatchObject({ Authorization:`Bearer ${input().apiKey}` }); expect(config.body).not.toContain(input().apiKey); expect(config.body).toContain('background only'); expect(config.redirect).toBe('error');
  });
  it('rejects missing approval/consent, endpoint injection and foreign origins without spending', async () => {
    const fetcher = vi.fn(); for (const req of [request(input(), 'https://evil.test'), request({ ...input(), approved: false }), request({ ...input(), consent: false }), request({ ...input(), baseUrl: 'http://127.0.0.1' }), request({ ...input(), modelId: '../evil' })]) expect((await handleBackgroundRequest(req, { fetcher })).status).toBeGreaterThanOrEqual(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not follow file URLs, accept corrupt images or return provider error strings', async () => {
    for (const json of [{ candidates: [{ content: { parts: [{ fileData: { fileUri: 'http://localhost/private' } }] } }] }, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('not png').toString('base64') } }] } }] }]) {
      const fetcher = vi.fn(async () => Response.json(json));
      const result = await handleBackgroundRequest(request(input()), { fetcher }); expect(result.status).toBe(502);
      const body = await result.json() as { error: { code: string; details?: { fields?: string[] } } };
      // Unknown image-bearing envelopes now report the diagnostic shape code
      // (the safety properties are unchanged: nothing is fetched or accepted).
      expect(body.error.code).toBe('image_shape'); expect(body.error.details?.fields).toContain('top:candidates'); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const result = await handleBackgroundRequest(request(input()), { fetcher: async () => Response.json({ error: { message: input().apiKey } }, { status: 401 }) }); expect(await result.text()).not.toContain(input().apiKey);
  });
  it('does not retry quota/unsupported/blocked responses and maps timeout safely', async () => {
    for (const status of [429, 400, 503]) { const fetcher = vi.fn(async () => Response.json({}, { status })); const result = await handleBackgroundRequest(request(input()), { fetcher }); expect(result.status).toBeGreaterThanOrEqual(400); expect(fetcher).toHaveBeenCalledTimes(1); }
    const blocked = await handleBackgroundRequest(request(input()), { fetcher: async () => Response.json({error:{code:'content_policy_violation'}},{status:400}) }); expect(blocked.status).toBe(422);
    const fetcher = vi.fn((_url: unknown, config?: RequestInit) => new Promise<Response>((_, reject) => config?.signal?.addEventListener('abort', () => reject(new Error('abort')))));
    const timeout = await handleBackgroundRequest(request(input()), { fetcher, timeoutMs:1000 }); expect(timeout.status).toBe(504); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
