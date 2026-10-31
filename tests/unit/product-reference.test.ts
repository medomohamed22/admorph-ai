import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { handleMetaRoute } from '../../src/lib/ai/meta-runtime';
import { buildOneshotPrompt, oneshotRequestSchema, productBoxFor, initialOneshotLayout, PRODUCT_REFERENCE_RULE, ONESHOT_WIDTH } from '../../src/lib/ai/oneshot';

// The painter gets a sharp product close-up beside the mockup, so the label is copied, not guessed.
const png = async (color: string, size = 32) => (await sharp({ create: { width: size, height: size, channels: 3, background: color } }).png().toBuffer()).toString('base64');
const request = (body: unknown) => new Request('https://app.test/api/ai/oneshot', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const brand = { name: 'Mono Audio', description: 'Headphones', colors: ['#16100C', '#F5EEDF', '#C8A27A'] as [string, string, string] };
const layout = [{ id: 'product', kind: 'product' as const, x: 160, y: 300, width: 760, height: 760 }, { id: 'headline', kind: 'text' as const, x: 140, y: 120, width: 800, height: 120, text: 'Quiet comfort' }];
async function body(withProduct: boolean) {
  return { providerId: 'meta', apiKey: crypto.randomUUID(), modelId: 'account-model', consent: true, imageConsent: true, mockup: { mimeType: 'image/png', data: await png('#e9e9e9') }, brand, scene: 'a calm desk', language: 'en', layout, ...(withProduct ? { product: { mimeType: 'image/png', data: await png('#111111') } } : {}) };
}
const painted = async () => Response.json({ data: [{ b64_json: await png('#8899aa', 16) }] });

describe('product close-up for the painter', () => {
  it('sends the mockup first and the product close-up second, with the copy-the-label rule', async () => {
    const fetcher = vi.fn(painted);
    const response = await handleMetaRoute(request(await body(true)), 'oneshot', { fetcher });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.images).toHaveLength(2);
    expect(sent.prompt).toContain(PRODUCT_REFERENCE_RULE);
  });

  it('paints from the mockup alone once if Meta refuses a second image', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => (++calls === 1 ? Response.json({ error: { message: 'too many images', param: 'images' } }, { status: 400 }) : painted()));
    const response = await handleMetaRoute(request(await body(true)), 'oneshot', { fetcher });
    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(retry.images).toHaveLength(1);
    expect(retry.prompt).not.toContain(PRODUCT_REFERENCE_RULE);
  });

  it('does not retry other failures, and stays one image without a close-up', async () => {
    const refused = vi.fn(async () => Response.json({ error: { code: 'content_policy_violation' } }, { status: 400 }));
    expect((await handleMetaRoute(request(await body(true)), 'oneshot', { fetcher: refused })).status).toBe(422);
    expect(refused).toHaveBeenCalledTimes(1);
    const fetcher = vi.fn(painted);
    await handleMetaRoute(request(await body(false)), 'oneshot', { fetcher });
    expect(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)).images).toHaveLength(1);
  });

  it('keeps the field optional and the rule out of the prompt without it', async () => {
    expect(oneshotRequestSchema.safeParse(await body(false)).success).toBe(true);
    expect(oneshotRequestSchema.safeParse(await body(true)).success).toBe(true);
    expect(buildOneshotPrompt(brand, 'a desk', layout, 'en')).not.toContain(PRODUCT_REFERENCE_RULE);
    expect(buildOneshotPrompt(brand, 'a desk', layout, 'en', [], '1080x1350', true)).toContain(PRODUCT_REFERENCE_RULE);
  });
});

describe('product box shaped like the product', () => {
  it('is as large as the space allows and keeps the product aspect', () => {
    const wide = productBoxFor(2), tall = productBoxFor(0.4), square = productBoxFor(1);
    expect(wide.width).toBe(760); expect(Math.abs(wide.width / wide.height - 2)).toBeLessThan(0.02);
    expect(tall.height).toBe(860); expect(Math.abs(tall.width / tall.height - 0.4)).toBeLessThan(0.02);
    expect(square.width).toBe(square.height);
    for (const box of [wide, tall, square]) { expect(box.x + box.width / 2).toBeCloseTo(ONESHOT_WIDTH / 2, 0); expect(box.y).toBeGreaterThanOrEqual(300); }
    // A square frame leaves less height.
    expect(productBoxFor(0.4, 1080).height).toBeLessThanOrEqual(670);
  });
  it('falls back to the old box without an aspect', () => {
    expect(initialOneshotLayout(false)[0]).toMatchObject({ x: 340, y: 380, width: 400, height: 600 });
    expect(initialOneshotLayout(false, 1)[0]).toMatchObject({ width: 760, height: 760 });
  });
});

describe('the review ignores the logo\'s own words', () => {
  it('tells the reviewer that a logo\'s name and tagline are not extra text', async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [] }) } }] }));
    const verify = { providerId: 'meta', apiKey: crypto.randomUUID(), modelId: 'account-model', consent: true, imageConsent: true, image: { mimeType: 'image/png', data: await png('#ddd') }, layout: [...layout, { id: 'logo', kind: 'logo', x: 830, y: 40, width: 200, height: 80 }], language: 'ar' };
    const response = await handleMetaRoute(new Request('https://app.test/api/ai/verify-oneshot', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' }, body: JSON.stringify(verify) }), 'verify-oneshot', { fetcher });
    expect(response.status).toBe(200);
    const prompt = JSON.stringify(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)));
    expect(prompt).toContain('is not part of the brand logo in the logo zone');
  });
});
