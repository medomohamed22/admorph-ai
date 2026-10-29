import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import sharp from 'sharp';
import { describe, it, expect, vi,beforeEach } from 'vitest';
import { compose } from '../../src/lib/editor/composition';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { checkCreative, fingerprint } from '../../src/lib/critic/rules';
import { aiReviewSchema } from '../../src/lib/critic/schema';
import { loadReview, saveReview } from '../../src/lib/critic/repository';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { handleCriticRequest, reviewRequestSchema, parseCriticResponse, criticPayload } from '../../src/lib/ai/critic-server';

let testKey='';beforeEach(()=>{testKey=crypto.randomUUID();});
function fixture() { const campaign = newCampaign(), concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
  const creative = compose(campaign, concept, crypto.randomUUID(), crypto.randomUUID());
  const metrics = Object.fromEntries(creative.layers.map(layer => [layer.id, { neededHeight: 70, unrenderable: false }]));
  const assets = new Set(creative.layers.flatMap(layer => layer.assetId ? [layer.assetId] : [])); return { creative, metrics, assets }; }
const opinion = { summary: 'The message may benefit from a clearer hierarchy.', issues: [{ category: 'hierarchy', severity: 'suggestion', layerId: null, title: 'Consider the reading order', explanation: 'The headline could receive more visual emphasis.', recommendation: 'Inspect the headline size manually.' }] };
function wire(review: unknown = opinion) { return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(review)}}], candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(review) }] } }] }; }
async function input() { const preview = await sharp({ create: { width: 540, height: 675, channels: 3, background: '#cfd8c0' } }).jpeg().toBuffer();
  return reviewRequestSchema.parse({ providerId: 'meta', modelId: 'chosen-critic', apiKey: testKey, consent: true, imageConsent: true, language: 'en', creative: fixture().creative, preview: { mimeType: 'image/jpeg', data: preview.toString('base64') } }); }
function request(body: unknown, origin = 'https://app.test') { return new Request('https://app.test/api/ai/critic', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }

describe('local design rules', () => {
  it('reports a known good layout without changing its data or inventing a score', () => {
    const { creative, metrics, assets } = fixture();
    // This fixture defines a good layout with opaque text backdrops, so
    // contrast is computable. Default compositions use transparent text
    // fills, whose contrast is honestly reported as unavailable.
    creative.layers.forEach(layer => { if (['brand', 'headline'].includes(layer.kind)) layer.fill = '#ffffff'; });
    const before = JSON.stringify(creative);
    const result = checkCreative(creative, metrics, assets); expect(result.issues).toEqual([]); expect(result.checks.every(check => check.status === 'pass')).toBe(true);
    expect(JSON.stringify(creative)).toBe(before); expect(result).not.toHaveProperty('score');
  });
  it('detects measured clipping, low contrast and missing copy independently', () => {
    const { creative, metrics, assets } = fixture(), headline = creative.layers.find(layer => layer.kind === 'headline')!;
    headline.fill = '#ffffff'; headline.color = headline.fill; metrics[headline.id].neededHeight = headline.height + 20;
    creative.layers.find(layer => layer.kind === 'cta')!.text = ' ';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['contrast', 'text_clipped', 'copy_missing']));
  });
  it('flags a CTA wearing non-brand colors only when the palette is known', () => {
    const { creative, metrics, assets } = fixture(), cta = creative.layers.find(layer => layer.kind === 'cta')!;
    cta.fill = '#d9c97a'; cta.color = '#ffffff';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).not.toContain('cta_off_brand');
    const flagged = checkCreative(creative, metrics, assets, { width: 1080, height: 1350 }, ['#16100C', '#F5EEDF', '#7ED3E0']);
    expect(flagged.issues.map(issue => issue.code)).toContain('cta_off_brand');
    expect(flagged.checks.find(check => check.key === 'brand')!.status).toBe('fail');
    cta.fill = '#16100C'; cta.color = '#F5EEDF';
    const clean = checkCreative(creative, metrics, assets, { width: 1080, height: 1350 }, ['#16100C', '#F5EEDF', '#7ED3E0']);
    expect(clean.issues.map(issue => issue.code)).not.toContain('cta_off_brand');
    expect(clean.checks.find(check => check.key === 'brand')!.status).toBe('pass');
  });
  it('detects out-of-bounds metadata, wrong dimensions, missing images and geometric overlap', () => {
    const { creative, metrics } = fixture(), logo = creative.layers.find(layer => layer.kind === 'logo')!, headline = creative.layers.find(layer => layer.kind === 'headline')!;
    logo.x = headline.x; logo.y = headline.y; creative.layers.find(layer => layer.kind === 'product')!.x = 2000;
    const result = checkCreative(creative, metrics, new Set(), { width: 800, height: 800 });
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['bounds', 'dimensions', 'asset_missing', 'logo_overlap']));
  });
  it('does not claim clipping or image-backed contrast was verified without measurements', () => {
    const { creative, assets } = fixture(), headline = creative.layers.find(layer => layer.kind === 'headline')!;
    creative.layers.push({ ...headline, id: crypto.randomUUID(), kind: 'logo', assetId: crypto.randomUUID() });
    const result = checkCreative(creative, {}, assets);
    expect(result.issues.some(issue => issue.code === 'measurement_unavailable')).toBe(true);
    expect(result.checks.find(check => check.key === 'text')?.status).toBe('partial'); expect(result.checks.find(check => check.key === 'contrast')?.status).toBe('partial');
  });
  it('marks no-visible-text checks as partial and changes fingerprint for content but not save timestamps', () => {
    const { creative, assets } = fixture(), original = fingerprint(creative); creative.updatedAt = new Date(0).toISOString(); expect(fingerprint(creative)).toBe(original);
    creative.layers.forEach(layer => { if (['headline', 'brand', 'cta'].includes(layer.kind)) layer.visible = false; });
    expect(fingerprint(creative)).not.toBe(original); expect(checkCreative(creative, {}, assets).checks.find(check => check.key === 'text')?.status).toBe('partial');
  });
  it('does not report a deliberately hidden product as a missing image, but still flags a design with no product layer', () => {
    const { creative, metrics, assets } = fixture(), product = creative.layers.find(layer => layer.kind === 'product')!;
    product.visible = false;
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).not.toContain('asset_missing');
    const removed = { ...creative, layers: creative.layers.filter(layer => layer.kind !== 'product') };
    expect(checkCreative(removed, metrics, assets).issues.map(issue => issue.code)).toContain('asset_missing');
  });
});
describe('Meta Critic boundaries', () => {
  it('uses the selected model and preview with a key header, without exposing credentials in prompts/results', async () => {
    const body = await input(), fetcher = vi.fn(async () => Response.json(wire({ ...opinion, summary: 'A note ' + body.apiKey })));
    const result = await handleCriticRequest(request(body), { fetcher }); expect(result.status).toBe(200); expect(await result.text()).not.toContain(body.apiKey); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit]; expect(url).toBe('https://api.meta.ai/v1/chat/completions'); expect(options.headers).toMatchObject({ Authorization:`Bearer ${body.apiKey}` });
    expect(JSON.stringify(criticPayload(body))).not.toContain(body.apiKey); expect(options.body).toContain('image_url'); expect(options.redirect).toBe('error'); expect(result.headers.get('cache-control')).toContain('no-store');
  });
  it('rejects missing image consent, wrong origin, arbitrary endpoints and unsafe model IDs before any fetch', async () => {
    const body = await input(), fetcher = vi.fn();
    for (const req of [request(body, 'https://evil.test'), request({ ...body, imageConsent: false }), request({ ...body, consent: false }), request({ ...body, baseUrl: 'http://localhost' }), request({ ...body, modelId: '../private' })]) expect((await handleCriticRequest(req, { fetcher })).status).toBeGreaterThanOrEqual(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects forged previews and unknown/executable review fields or layer IDs', async () => {
    const body = await input(), fetcher = vi.fn(); body.preview.data = Buffer.from('not jpeg').toString('base64');
    expect((await handleCriticRequest(request(body), { fetcher })).status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
    expect(aiReviewSchema.safeParse({ ...opinion, score: 99 }).success).toBe(false);
    expect(() => parseCriticResponse(wire({ ...opinion, actions: [{ code: 'run_js' }] }), new Set())).toThrow('review_invalid');
    expect(() => parseCriticResponse(wire({ ...opinion, issues: [{ ...opinion.issues[0], layerId: crypto.randomUUID() }] }), new Set())).toThrow('review_invalid');
  });
  it('reports refusal/truncation/malformed responses and ignores reasoning parts', () => {
    expect(() => parseCriticResponse({ promptFeedback: { blockReason: 'SAFETY' } }, new Set())).toThrow('plan_blocked');
    expect(() => parseCriticResponse({ candidates: [{ finishReason: 'MAX_TOKENS' }] }, new Set())).toThrow('plan_truncated');
    expect(() => parseCriticResponse({ candidates: [] }, new Set())).toThrow('review_invalid');
    const response = wire(); response.candidates[0].content.parts.unshift({ text: 'private thinking', thought: true } as never);
    expect(parseCriticResponse(response, new Set()).summary).toBe(opinion.summary);
  });
  it('does not retry paid requests and returns safe quota/auth/timeout failures', async () => {
    const body = await input();
    for (const status of [401, 429, 503]) { const fetcher = vi.fn(async () => Response.json({ message: body.apiKey }, { status })); const result = await handleCriticRequest(request(body), { fetcher }); expect(result.status).toBeGreaterThanOrEqual(400); expect(await result.text()).not.toContain(body.apiKey); expect(fetcher).toHaveBeenCalledTimes(1); }
    const fetcher = vi.fn((_url: unknown, options?: RequestInit) => new Promise<Response>((_, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    expect((await handleCriticRequest(request(body), { fetcher, timeoutMs:1000 })).status).toBe(504); expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe('saved reviews', () => {
  it('upgrades version three without deleting creative metadata, assets or credentials', async () => {
    const name = `critic-migration-${crypto.randomUUID()}`, old = new Dexie(name), { creative } = fixture();
    old.version(3).stores({ settings: 'key', brands: 'id, updatedAt', assets: 'id, kind, createdAt', modelCatalogCache: 'providerId, fetchedAt', encryptedCredentials: 'providerId', campaigns: 'id, brandId, updatedAt', creatives: 'id, campaignId, conceptId, updatedAt' });
    await old.table('creatives').put(creative); await old.table('assets').put({ id: 'existing-asset', kind: 'product', blob: new Blob(['old']) }); await old.table('encryptedCredentials').put({ providerId: 'meta', ciphertext: [1, 2, 3] }); old.close();
    const db = new AdMorphDB(name); try { await db.open(); expect(db.verno).toBe(8); expect(await db.creatives.get(creative.id)).toEqual(creative); expect(await db.assets.count()).toBe(1); expect(await db.encryptedCredentials.count()).toBe(1); expect(await db.creativeReviews.count()).toBe(0); } finally { await db.delete(); }
  });
  it('stores review provenance and content without a key or preview image', async () => {
    const db = new AdMorphDB(`review-${crypto.randomUUID()}`), { creative } = fixture();
    try { const record = { id: creative.id, creativeId: creative.id, fingerprint: fingerprint(creative), reviewedAt: new Date().toISOString(), language: 'en' as const, model: { provider: 'gemini' as const, modelId: 'saved-critic' }, source: 'gemini' as const, review: aiReviewSchema.parse(opinion) };
      await saveReview(record, db); const saved = await loadReview(creative.id, db); expect(saved).toEqual(record); expect(JSON.stringify(saved)).not.toMatch(/apiKey|preview|base64/);
    } finally { await db.delete(); }
  });
});

describe('direction mismatch rule', () => {
  it('flags Arabic text forced LTR and Latin text forced RTL, and clears on auto', () => {
    const { creative, metrics, assets } = fixture();
    const headline = creative.layers.find(layer => layer.kind === 'headline')!;
    headline.text = 'ساقعة على طول'; headline.dir = 'ltr';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).toContain('direction_mismatch');
    headline.dir = 'auto';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).not.toContain('direction_mismatch');
    headline.text = 'Ice-cold. Always.'; headline.dir = 'rtl';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).toContain('direction_mismatch');
  });
  it('ignores matching directions and directionless text', () => {
    const { creative, metrics, assets } = fixture();
    const headline = creative.layers.find(layer => layer.kind === 'headline')!;
    headline.text = 'ساقعة على طول'; headline.dir = 'rtl';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).not.toContain('direction_mismatch');
    headline.text = '12345'; headline.dir = 'rtl';
    expect(checkCreative(creative, metrics, assets).issues.map(issue => issue.code)).not.toContain('direction_mismatch');
  });
});
