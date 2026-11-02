import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { tightenEdge } from '../../src/lib/cutout/sam-client';
import { readableText, settleReview, reviewOutcome, oneshotScore, type VerifyResult, type OneshotElement } from '../../src/lib/ai/oneshot';
import { cropWindow, boxInWindow } from '../../src/lib/shelf/crop';

describe('cutout edge keeps thin parts', () => {
  it('pulls in a thick body but keeps a 2-pixel strap attached to it', () => {
    const width = 40, height = 30, alpha = new Uint8ClampedArray(width * height);
    for (let y = 8; y < 24; y++) for (let x = 4; x < 20; x++) alpha[y * width + x] = 255;   // the body
    for (let y = 14; y < 16; y++) for (let x = 20; x < 38; x++) alpha[y * width + x] = 255; // a 2 px strap
    tightenEdge(alpha, width, height, 3);
    expect(alpha[16 * width + 4]).toBe(0);           // the body's edge strip is pulled in
    expect(alpha[16 * width + 12]).toBe(255);        // the body's middle stays
    expect(alpha[14 * width + 30]).toBeGreaterThan(127); // the strap is still there
    expect(alpha[15 * width + 36]).toBeGreaterThan(0);
  });
});

const element = (id: string, text: string): OneshotElement => ({ id, kind: 'text', x: 0, y: 0, width: 100, height: 40, text });
const review = (patch: Partial<VerifyResult>): VerifyResult => ({ productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [], extraText: [], ...patch });

describe('review text matching', () => {
  it('reads Arabic the way a reader does', () => {
    expect(readableText('خَصْمٌ ٢٠٪')).toBe(readableText('خصم 20%'));
    expect(readableText('إلى الأبد')).toBe(readableText('الي الابد'));
    expect(readableText('عـــرض')).toBe(readableText('عرض'));
    expect(readableText('Stay Cool, All Day!')).toBe(readableText('stay cool all day'));
    expect(readableText('برودة')).not.toBe(readableText('بروده')); // a different letter is still a different word
  });
  it('a headline read with only diacritics or digit differences counts as a match, and the score follows', () => {
    const layout = [element('headline', 'خصم 20% الأسبوع ده')];
    const raw = review({ texts: [{ id: 'headline', expected: 'خصم 20% الأسبوع ده', found: 'خَصْم ٢٠٪ الاسبوع ده', match: false }] });
    const settled = settleReview(raw, layout);
    expect(settled.texts[0].match).toBe(true);
    expect(oneshotScore(settled, false)).toBe(100);
    expect(oneshotScore(raw, false)).toBeLessThan(80);
  });
  it('a real misspelling stays wrong, and an "extra" word that is the headline itself is dropped', () => {
    const layout = [element('headline', 'Ready For Every Run')];
    const settled = settleReview(review({ texts: [{ id: 'headline', expected: 'Ready For Every Run', found: 'Raedy For Evry Run', match: false }], extraText: ['Ready for every run!', 'BUY NOW'] }), layout);
    expect(settled.texts[0].match).toBe(false);
    expect(settled.extraText).toEqual(['BUY NOW']);
  });
  it('the review log names failed checks but never the ad\'s words', () => {
    const outcome = reviewOutcome(review({ productKept: false, texts: [{ id: 'headline', expected: 'Secret words', found: 'Secrt', match: false }], extraText: ['SLOGAN'], seasonCues: ['lantern'] }), 'ramadan');
    expect(outcome).toMatchObject({ product: false, textsWrong: 1, texts: 1, extra: 1, season: 'ramadan', cues: 1 });
    expect(JSON.stringify(outcome)).not.toMatch(/Secret|Secrt|SLOGAN|lantern/);
  });
});

describe('shelf crop around a product', () => {
  it('pads the box by 30% on every side inside the photo, and maps the box into the crop', () => {
    const box = { left: 0.4, top: 0.4, right: 0.6, bottom: 0.8 };
    const window = cropWindow(box);
    expect(window.left).toBeCloseTo(0.34); expect(window.right).toBeCloseTo(0.66);
    expect(window.top).toBeCloseTo(0.28); expect(window.bottom).toBeCloseTo(0.92);
    const inner = boxInWindow(box, window);
    expect(inner.left).toBeCloseTo(0.1875); expect(inner.right).toBeCloseTo(0.8125);
    // Near the photo's edge the window is clamped and the box still lands on the product.
    const edge = cropWindow({ left: 0, top: 0.1, right: 0.2, bottom: 0.3 });
    expect(edge.left).toBe(0);
    expect(boxInWindow({ left: 0, top: 0.1, right: 0.2, bottom: 0.3 }, edge).left).toBe(0);
  });
});

import { withOneRetry } from '../../src/lib/shelf/queue';
import { ProviderError } from '../../src/lib/ai/errors';
import { JSON_OUTPUT_TOKENS } from '../../src/lib/ai/meta-transport';

describe('one retry for a passing failure', () => {
  const noWait = () => Promise.resolve();
  it('paints again once after an upstream or network failure', async () => {
    let calls = 0;
    await expect(withOneRetry(async () => { calls++; if (calls === 1) throw new ProviderError('upstream', 502); return 'ad'; }, noWait)).resolves.toBe('ad');
    expect(calls).toBe(2);
    calls = 0;
    await expect(withOneRetry(async () => { calls++; throw new ProviderError('network', 502); }, noWait)).rejects.toMatchObject({ code: 'network' });
    expect(calls).toBe(2);
  });
  it('does not retry a timeout, a refusal or a quota error', async () => {
    for (const code of ['timeout', 'plan_blocked', 'quota', 'rate_limit'] as const) {
      let calls = 0;
      await expect(withOneRetry(async () => { calls++; throw new ProviderError(code, 400); }, noWait)).rejects.toMatchObject({ code });
      expect(calls).toBe(1);
    }
  });
  it('the JSON cap leaves room for hidden reasoning on top of the longest visible answer', () => {
    expect(JSON_OUTPUT_TOKENS).toBe(8192);
  });
});

import { placeOf, expectedPositions, buildOneshotPrompt, verifyRequestSchema } from '../../src/lib/ai/oneshot';

describe('the painter and the reviewer know where each element goes', () => {
  const layout: OneshotElement[] = [
    { id: 'product', kind: 'product', x: 600, y: 300, width: 400, height: 980 },
    { id: 'headline', kind: 'text', x: 70, y: 1000, width: 500, height: 200, text: 'Cold for 24 hours' },
    { id: 'logo', kind: 'logo', x: 820, y: 70, width: 200, height: 90 },
  ];
  it('names each position in words and in exact shares of the frame, for every size', () => {
    expect(placeOf(layout[1])).toBe('bottom left (left 6-53%, top 74-89% of the frame)');
    expect(placeOf({ x: 0, y: 1500, width: 1080, height: 300 }, 1920)).toBe('bottom (left 0-100%, top 78-94% of the frame)');
  });
  it('the painter keeps the logo as drawn and gets exact positions', () => {
    const prompt = buildOneshotPrompt({ name: 'hope.', description: 'x', colors: ['#111111', '#222222', '#333333'] }, 'a desk', layout, 'en');
    expect(prompt).toContain('The text "Cold for 24 hours" stays bottom left (left 6-53%, top 74-89% of the frame)');
    expect(prompt).toContain('copied exactly as drawn in the mockup: same shape, letters and colors, never redrawn or restyled');
  });
  it('the reviewer gets every expected position, measured on the ad\'s own size', () => {
    const positions = expectedPositions(layout, '1080x1350');
    expect(positions).toContain('headline (text "Cold for 24 hours"): bottom left (left 6-53%, top 74-89% of the frame)');
    expect(positions).toContain('product (product): right');
    expect(expectedPositions([{ id: 'h', kind: 'text', x: 0, y: 900, width: 1080, height: 100, text: 'x' }], '1080x1080')).toContain('top 83-93%');
    expect(verifyRequestSchema.shape.format).toBeDefined();
  });
});

import { needsRepair } from '../../src/lib/agent/pipeline';

describe('an ad that cannot be published is repaired even with a good score', () => {
  it('repairs an unreadable or overlapping headline at 85, not a clean 85', () => {
    const base = review({ texts: [{ id: 'headline', expected: 'Hi', found: 'Hi', match: true }] });
    expect(needsRepair({ ...base, textReadable: false }, 85)).toBe(true);
    expect(needsRepair({ ...base, textClearOfProduct: false }, 85)).toBe(true);
    expect(needsRepair(base, 85)).toBe(false);
    expect(needsRepair(base, 70)).toBe(true);
    expect(needsRepair(null, 10)).toBe(false);
  });
  it('the painter keeps the area behind each word clear', () => {
    const prompt = buildOneshotPrompt({ name: 'hope.', description: 'x', colors: ['#111111', '#222222', '#333333'] }, 'a desk', [{ id: 'headline', kind: 'text', x: 70, y: 1000, width: 500, height: 200, text: 'Cold' }], 'en');
    expect(prompt).toContain('keep that area of the scene free of objects, patterns and colors close to the text\'s own color');
  });
});

import { aspectOf } from '../../src/lib/editor/sizes';

describe('gallery tiles and free layouts', () => {
  it('a tile takes the ad\'s own shape, so a square ad is not cropped to 4:5', () => {
    expect(aspectOf('1080x1080')).toBe('1080 / 1080');
    expect(aspectOf('1080x1920')).toBe('1080 / 1920');
    expect(aspectOf(undefined)).toBe('1080 / 1350');
  });
  it('a seasonal copy or variant is reviewed without fixed positions', () => {
    expect(verifyRequestSchema.shape.freeLayout).toBeDefined();
  });
});

import { metaJson as metaJsonCall } from '../../src/lib/ai/meta-transport';
import { productBoxSchema } from '../../src/lib/ai/meta-contracts';
import { handleMetaRoute } from '../../src/lib/ai/meta-runtime';
import { readFileSync as readFile } from 'node:fs';

const png64 = readFile('public/demo/sora-product.png').toString('base64');
const okReview = { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] };
const chat = (content: unknown) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
const verifyPost = (body: Record<string, unknown>) => new Request('https://app.test/api/ai/verify-oneshot', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.test' }, body: JSON.stringify({ providerId: 'meta', apiKey: 'k-' + crypto.randomUUID(), modelId: 'm', consent: true, imageConsent: true, image: { mimeType: 'image/png', data: png64 }, layout: [{ id: 'headline', kind: 'text', x: 0, y: 0, width: 500, height: 100, text: 'Hi' }], language: 'en', ...body }) });

describe('the reviewer sees the real product', () => {
  it('sends the ad and the product close-up together, and says what the second image is', async () => {
    const fetcher = vi.fn(async () => chat(okReview));
    const result = await handleMetaRoute(verifyPost({ product: { mimeType: 'image/png', data: png64 } }), 'verify-oneshot', { fetcher });
    expect(result.status).toBe(200);
    const payload = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload.messages[1].content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(2);
    expect(payload.messages[1].content[0].text).toContain('The second image is a sharp close-up of the real product');
  });
  it('if Meta refuses a second image, the ad is reviewed alone as before', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: { message: 'one image only' } }, { status: 400 })).mockResolvedValueOnce(chat(okReview));
    const result = await handleMetaRoute(verifyPost({ product: { mimeType: 'image/png', data: png64 } }), 'verify-oneshot', { fetcher });
    expect(result.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
    const second = JSON.parse((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages[1].content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(1);
    expect(second.messages[1].content[0].text).not.toContain('second image');
  });
  it('a review without a product image is unchanged', async () => {
    const fetcher = vi.fn(async () => chat(okReview));
    expect((await handleMetaRoute(verifyPost({}), 'verify-oneshot', { fetcher })).status).toBe(200);
    const payload = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload.messages[1].content.filter((part: { type: string }) => part.type === 'image_url')).toHaveLength(1);
  });
  it('several images go to Muse Spark in order', async () => {
    const fetcher = vi.fn(async () => chat({ x: 'y' }));
    await metaJsonCall('m', 'k', 'p', z.object({ x: z.string() }), [{ mimeType: 'image/png', data: png64 }, { mimeType: 'image/png', data: png64 }], new AbortController().signal, { fetcher });
    const payload = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(payload.messages[1].content.map((part: { type: string }) => part.type)).toEqual(['text', 'image_url', 'image_url']);
  });
});

describe('a product held in a hand', () => {
  it('the locator also names the product and says whether a hand holds it', () => {
    expect(productBoxSchema.safeParse({ left: 0.2, top: 0.1, right: 0.6, bottom: 0.9, name: 'white water bottle', heldByHand: true }).success).toBe(true);
    expect(productBoxSchema.safeParse({ left: 0.2, top: 0.1, right: 0.6, bottom: 0.9 }).success).toBe(true);
  });
});
