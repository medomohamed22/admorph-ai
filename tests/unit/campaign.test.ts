import 'fake-indexeddb/auto';
import {readFileSync} from 'node:fs';
import {metaJson} from '../../src/lib/ai/meta-transport';
import { describe, it, expect, vi,beforeEach } from 'vitest';
import { newCampaign, planSchema, planRequestSchema, campaignSchema, MAX_PRODUCT_BYTES } from '../../src/lib/campaign/schema';
import { samplePlan } from './fixtures/sample-plan';
import { handlePlanRequest } from '../../src/lib/ai/planning-server';

const png=readFileSync('public/demo/sora-product.png').toString('base64');
let testKey='';beforeEach(()=>{testKey=crypto.randomUUID();});
async function metaPlan(body:ReturnType<typeof input>,options:import('../../src/lib/ai/transport').TransportOptions={}){if(options.signal?.aborted)throw new (await import('../../src/lib/ai/errors')).ProviderError('cancelled',499);return metaJson(body.modelId,body.apiKey,'Plan a campaign',planSchema,body.product,AbortSignal.any([options.signal??new AbortController().signal,AbortSignal.timeout(options.timeoutMs??45000)]),options);}
function input() { const draft = newCampaign(); return planRequestSchema.parse({ providerId: 'meta', apiKey: testKey, modelId: 'chosen-model', consent: true, imageConsent: true,
  brand: draft.brandSnapshot, brief: 'Promote the sample product honestly.', goal: 'awareness', creativeLanguage: 'en', format: '1080x1350', product: { mimeType: 'image/png', data: png } }); }
function response(plan = samplePlan(newCampaign())) { return { choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}],candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(plan) }] } }] }; }
// What Muse Spark now writes for the planner route: named offer/benefit/lifestyle ideas, each with a required art brief.
const brief = (setting: string) => ({ setting, props: ['a linen cloth'], lighting: 'soft window light', camera: 'eye level, 50mm', composition: 'product right, calm wall left for the headline', palette: ['#F5EEDF'], typeStyle: 'bold sans', avoid: ['clutter'] });
function plannerOutput(plan = samplePlan(newCampaign())) { const [a, b, c] = plan.concepts; const idea = (concept: typeof a, setting: string) => ({ title: concept.title.slice(0, 60), headline: concept.headline.slice(0, 90), caption: concept.caption, artBrief: brief(setting) }); return { offer: idea(a, 'a sunny kitchen counter'), benefit: idea(b, 'a desk by a window'), lifestyle: idea(c, 'a park bench') }; }
function plannerResponse(output: unknown = plannerOutput()) { return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }; }
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
  it('sends the chosen model, key header, image and JSON schema to a fixed host once', async () => {
    const fetcher = vi.fn(async () => Response.json(response()));
    await metaPlan(input(), { fetcher }); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(url).not.toContain(input().apiKey); expect(init.headers).toMatchObject({ Authorization: `Bearer ${input().apiKey}` });
    const payload = JSON.parse(init.body as string); expect(payload.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${png}`);
    expect(payload.response_format.json_schema.schema.properties.concepts.minItems).toBe(1); expect(payload.response_format.json_schema.schema.properties.concepts.maxItems).toBe(3); expect(init.redirect).toBe('error');
  });
  it('sends a typed place and the looks to the planner, and natural places when no place is typed', async () => {
    const promptOf = async (extra: Record<string, unknown>) => {
      const fetcher = vi.fn(async () => Response.json(plannerResponse()));
      const result = await handlePlanRequest(request({ ...input(), ...extra }), { fetcher });
      expect(result.status).toBe(200);
      return String(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).messages[1].content[0].text);
    };
    const natural = await promptOf({ looks: ['soft morning window light', 'golden-hour side light', 'moody low-key light'] });
    expect(natural).toContain('naturally used');
    expect(natural).toContain('(2) golden-hour side light');
    const typed = await promptOf({ place: 'a beach at sunset' });
    expect(typed).toContain('The user chose where the ad takes place: "a beach at sunset"');
    expect(typed).not.toContain('Never put the product in a place');
    expect(planRequestSchema.safeParse({ ...input(), place: 'x'.repeat(121) }).success).toBe(false);
    expect(planRequestSchema.safeParse({ ...input(), looks: ['a', 'b', 'c', 'd'] }).success).toBe(false);
  });
  it('accepts an empty brief and tells the model to derive ideas from the photo and brand', async () => {
    const body = input(); body.brief = '';
    expect(planRequestSchema.safeParse(body).success).toBe(true);
    const fetcher = vi.fn(async () => Response.json(plannerResponse()));
    const result = await handlePlanRequest(request(body), { fetcher });
    expect(result.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(init.body as string);
    expect(payload.messages[1].content[0].text).toContain('No written brief was supplied');
    expect(payload.messages[1].content[1].image_url.url).toBe(`data:image/png;base64,${png}`);
  });
  it('never retries paid posts and maps quota without returning raw errors', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { code: 'insufficient_quota', message: input().apiKey } }, { status: 429 }));
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
    const output = plannerOutput(); output.offer.caption = `${output.offer.caption.slice(0, 300)} ${input().apiKey}`;
    const result = await handlePlanRequest(request(input()), { fetcher: async () => Response.json(plannerResponse(output)) });
    expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toContain('no-store'); expect(await result.text()).not.toContain(input().apiKey);
  });
  it('handles timeout and cancellation without a repeated request', async () => {
    const fetcher = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abort')))));
    await expect(metaPlan(input(), { fetcher, timeoutMs:1000 })).rejects.toMatchObject({ code: 'timeout' }); expect(fetcher).toHaveBeenCalledTimes(1);
    const abort = new AbortController(); abort.abort();
    await expect(metaPlan(input(), { signal: abort.signal, fetcher: async () => { throw new Error('aborted'); } })).rejects.toMatchObject({ code: 'cancelled' });
  });
});
