import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePlanRequest } from '../../src/lib/ai/planning-server';
import { clampToJsonSchema, metaJson, fitImageResponse } from '../../src/lib/ai/meta-transport';
import { newCampaign, planRequestSchema, plannerOutputSchemaFor, planFromPlannerOutput } from '../../src/lib/campaign/schema';
import { buildRemixPrompt, remixRequestSchema } from '../../src/lib/ai/remix';
import { runPool, paintLanes } from '../../src/lib/shelf/queue';
import { z } from 'zod';

const png = readFileSync('public/demo/sora-product.png').toString('base64');
let key = ''; beforeEach(() => { key = crypto.randomUUID(); });
const brief = (setting: string) => ({ setting, props: ['a linen cloth'], lighting: 'soft window light', camera: 'eye level', composition: 'product right, headline left', palette: ['#F5EEDF'], typeStyle: 'bold sans', avoid: ['clutter'] });
const idea = (n: number, setting: string) => ({ title: `Idea ${n}`, headline: `Headline number ${n}`, caption: `Caption number ${n}.`, artBrief: brief(setting) });
const three = () => ({ offer: idea(1, 'a kitchen counter'), benefit: idea(2, 'a desk by a window'), lifestyle: idea(3, 'a park bench') });
const reply = (content: unknown, finish = 'stop') => Response.json({ choices: [{ finish_reason: finish, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] });
function body(extra: Record<string, unknown> = {}) {
  const draft = newCampaign();
  return planRequestSchema.parse({ providerId: 'meta', apiKey: key, modelId: 'chosen-model', consent: true, imageConsent: true, brand: draft.brandSnapshot, brief: 'Sell it honestly.', goal: 'awareness', creativeLanguage: 'en', format: '1080x1350', product: { mimeType: 'image/png', data: png }, ...extra });
}
const post = (value: unknown) => new Request('https://app.test/api/ai/plan', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test' }, body: JSON.stringify(value) });
const sentSchema = (fetcher: ReturnType<typeof vi.fn>, call = 0) => JSON.parse((fetcher.mock.calls[call] as unknown as [string, RequestInit])[1].body as string).response_format.json_schema.schema;

describe('lean ideas planner', () => {
  it('asks only for the fields the studio uses, with a required art brief and short limits', async () => {
    const fetcher = vi.fn(async () => reply(three()));
    const result = await handlePlanRequest(post(body()), { fetcher });
    expect(result.status).toBe(200);
    const schema = sentSchema(fetcher);
    expect(schema.required).toEqual(['offer', 'benefit', 'lifestyle']);
    expect(schema.properties.offer.required).toEqual(['title', 'headline', 'caption', 'artBrief']);
    expect(schema.properties.offer.properties.caption.maxLength).toBe(400);
    expect(JSON.stringify(schema)).not.toMatch(/negativeSpaceInstruction|audienceAngle|visualDirection|spatialPreset/);
    const prompt = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).messages[1].content[0].text as string;
    expect(prompt).not.toContain('negativeSpaceInstruction'); expect(prompt).not.toContain('Set visualDirection');
    // The studio still receives the plan shape it has always read, with the scene built from the brief.
    const plan = await result.json();
    expect(plan.concepts.map((concept: { angle: string }) => concept.angle)).toEqual(['offer', 'benefit', 'lifestyle']);
    expect(plan.concepts[1].visualDirection).toContain('a desk by a window');
    expect(plan.concepts[1].artBrief.setting).toBe('a desk by a window');
  });
  it('writes a single idea when only one is needed (a seasonal copy)', async () => {
    const fetcher = vi.fn(async () => reply({ offer: idea(1, 'a festive table') }));
    const result = await handlePlanRequest(post(body({ count: 1 })), { fetcher });
    expect(result.status).toBe(200);
    expect(sentSchema(fetcher).required).toEqual(['offer']);
    expect((await result.json()).concepts).toHaveLength(1);
  });
  it('the longest answer the schema allows stays well under the 4096-token output cap', () => {
    const max = plannerOutputSchemaFor(3);
    const json = z.toJSONSchema(max) as { properties: Record<string, unknown> };
    // Every string at its maximum and every list at its maximum length.
    const fill = (node: { type?: string; maxLength?: number; maxItems?: number; items?: unknown; properties?: Record<string, unknown> }): unknown =>
      node.type === 'string' ? 'x'.repeat(node.maxLength ?? 10) : node.type === 'array' ? Array.from({ length: node.maxItems ?? 1 }, () => fill(node.items as never)) : node.properties ? Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, fill(v as never)])) : null;
    const longest = JSON.stringify(fill(json as never));
    // About 3 characters per token for mixed Arabic copy and English briefs: still under the cap.
    expect(longest.length / 3).toBeLessThan(4096);
  });
  it('rejects ideas that repeat each other', () => {
    const same = three(); same.benefit.headline = same.offer.headline;
    expect(plannerOutputSchemaFor(3).safeParse(same).success).toBe(false);
    expect(planFromPlannerOutput(three()).concepts).toHaveLength(3);
  });
});

describe('Muse Spark JSON answers', () => {
  it('shortens a wordy answer instead of failing the step', async () => {
    const wordy = three(); wordy.offer.caption = 'y'.repeat(900); wordy.offer.artBrief.props = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fetcher = vi.fn(async () => reply(wordy));
    const result = await handlePlanRequest(post(body()), { fetcher });
    expect(result.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(1);
    const plan = await result.json();
    expect(plan.concepts[0].caption).toHaveLength(400); expect(plan.concepts[0].artBrief.props).toHaveLength(4);
    expect(clampToJsonSchema({ a: '  hi  ', extra: 1 }, { properties: { a: { type: 'string', maxLength: 1 } }, additionalProperties: false })).toEqual({ a: 'h' });
  });
  it('asks once more when an answer is cut off, and the second answer is used', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply('{"offer":', 'length')).mockResolvedValueOnce(reply(three()));
    const result = await handlePlanRequest(post(body()), { fetcher });
    expect(result.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
    const retryPrompt = JSON.parse((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).messages[1].content[0].text as string;
    expect(retryPrompt).toContain('keep every field short');
  });
  it('gives up after one retry and reports which fields failed, never the text', async () => {
    const fetcher = vi.fn(async () => reply({ offer: { title: 'only a title' } }));
    const result = await handlePlanRequest(post(body()), { fetcher });
    expect(result.status).toBe(502); expect(fetcher).toHaveBeenCalledTimes(2);
    const error = (await result.json()).error;
    expect(error.code).toBe('invalid_response');
    expect(error.details.fields.join(' ')).toContain('offer.headline');
    expect(JSON.stringify(error)).not.toContain('only a title');
  });
  it('does not retry steps that did not opt in', async () => {
    const fetcher = vi.fn(async () => reply('{"x":', 'length'));
    await expect(metaJson('m', key, 'p', z.object({ x: z.string() }), undefined, new AbortController().signal, { fetcher })).rejects.toMatchObject({ code: 'plan_truncated' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('seasonal and variant copies', () => {
  it('a repair passes the reviewer notes to the painter', () => {
    expect(remixRequestSchema.shape.fixNotes).toBeDefined();
    const prompt = buildRemixPrompt({ name: 'Hope', colors: ['#111111', '#222222', '#333333'] }, 'a festive table', 'Ramadan Kareem', 'en', 'product', 'ramadan', ['Write "Ramadan Kareem" exactly as given.']);
    expect(prompt).toContain('A previous attempt failed review. Fix exactly these problems: (1) Write "Ramadan Kareem" exactly as given.');
    expect(buildRemixPrompt({ name: 'Hope', colors: ['#111111', '#222222', '#333333'] }, 'a table', 'Hi', 'en')).not.toContain('previous attempt');
  });
  it('paints side by side with the site key, one at a time with a visitor key', async () => {
    expect(paintLanes('ready')).toBe(3); expect(paintLanes('missing')).toBe(1); expect(paintLanes('checking')).toBe(1);
    let running = 0, peak = 0; const done: number[] = [];
    await runPool([1, 2, 3, 4, 5], 3, async item => { running++; peak = Math.max(peak, running); await new Promise(resolve => setTimeout(resolve, 5)); done.push(item); running--; });
    expect(peak).toBe(3); expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
    peak = 0; await runPool([1, 2], 1, async () => { running++; peak = Math.max(peak, running); await Promise.resolve(); running--; });
    expect(peak).toBe(1);
  });
});

describe('painted image hand-off', () => {
  it('fits an oversized PNG under the cap losslessly', async () => {
    const sharp = (await import('sharp')).default;
    const noisy = await sharp(Buffer.from(Array.from({ length: 900 * 900 * 3 }, (_, i) => (i * 7919) % 251)), { raw: { width: 900, height: 900, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
    const fitted = await fitImageResponse(noisy, 'png', noisy.length - 1);
    expect(fitted.mimeType).toBe('image/png'); expect(fitted.bytes.length).toBeLessThan(noisy.length);
    const a = await sharp(noisy).raw().toBuffer(), b = await sharp(fitted.bytes).raw().toBuffer();
    expect(Buffer.compare(a, b)).toBe(0);
  });
});
