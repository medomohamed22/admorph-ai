import { describe, expect, it } from 'vitest';
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
