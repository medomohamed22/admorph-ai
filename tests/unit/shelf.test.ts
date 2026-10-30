import { describe, it, expect } from 'vitest';
import { laplacianVariance } from '../../src/lib/shelf/frames';
import { alphaBounds } from '../../src/lib/shelf/crop';
import { shelfLayout } from '../../src/lib/shelf/mockup';
import { withRateLimit } from '../../src/lib/shelf/queue';
import { cleanDetections, shelfDetectionSchema, shelfPlanRequest, shelfPlanSchema, SHELF_MAX_PRODUCTS } from '../../src/lib/shelf/schema';
import { ProviderError } from '../../src/lib/ai/errors';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('shelf video scan', () => {
  it('scores a sharp checkerboard far above a flat frame', () => {
    const w = 16, h = 16;
    const flat = new Float32Array(w * h).fill(128);
    const sharp = Float32Array.from({ length: w * h }, (_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0);
    expect(laplacianVariance(flat, w, h)).toBe(0);
    expect(laplacianVariance(sharp, w, h)).toBeGreaterThan(1000);
  });
});

describe('shelf detection cleanup', () => {
  it('drops inverted and sliver boxes, keeps the biggest first, at most six', () => {
    const products = [
      { name: 'small', category: 'food' as const, box: box(0.1, 0.1, 0.2, 0.2), priceText: '' },
      { name: 'inverted', category: 'food' as const, box: box(0.5, 0.5, 0.4, 0.6), priceText: '' },
      { name: 'sliver', category: 'food' as const, box: box(0.1, 0.1, 0.11, 0.2), priceText: '' },
      { name: 'big', category: 'beverage' as const, box: box(0, 0, 0.5, 0.8), priceText: '45 EGP' },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `n${i}`, category: 'other' as const, box: box(0.1, 0.1, 0.3, 0.3), priceText: '' })),
    ];
    const cleaned = cleanDetections(products);
    expect(cleaned[0].name).toBe('big');
    expect(cleaned.some(item => item.name === 'inverted' || item.name === 'sliver')).toBe(false);
    expect(cleaned).toHaveLength(SHELF_MAX_PRODUCTS);
  });
  it('validates the detector and planner contracts', () => {
    expect(shelfDetectionSchema.safeParse({ products: [{ name: 'TALJ', category: 'beverage', box: box(0, 0, 0.3, 0.8), priceText: '45 EGP' }] }).success).toBe(true);
    expect(shelfDetectionSchema.safeParse({ products: [{ name: 'TALJ', category: 'drinks', box: box(0, 0, 0.3, 0.8), priceText: '' }] }).success).toBe(false);
    const base = { providerId: 'meta', apiKey: 'k', modelId: 'muse-spark-1.3-contributor', consent: true, brand: { name: 'S', description: 'D', colors: ['#111111', '#222222', '#333333'] }, dialect: 'ar_gulf' };
    expect(shelfPlanRequest.safeParse({ ...base, products: [{ id: 'p1', name: 'TALJ', category: 'beverage', priceText: '' }] }).success).toBe(true);
    expect(shelfPlanRequest.safeParse({ ...base, products: Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: 'x', category: 'other', priceText: '' })) }).success).toBe(false);
    expect(shelfPlanSchema.safeParse({ campaignName: 'Summer', products: [{ id: 'p1', headline: 'Hi', cta: 'Buy', scene: 'a sunny cafe table', caption: 'c' }] }).success).toBe(true);
  });
});

describe('shelf mockup', () => {
  it('fits the product in the middle area keeping its aspect, and adds the price only when there is one', () => {
    const tall = shelfLayout({ headline: 'H', cta: 'Buy', priceText: '', productAspect: 0.5, rtl: false });
    const product = tall.find(item => item.kind === 'product')!;
    expect(product.width / product.height).toBeCloseTo(0.5, 1);
    expect(tall.some(item => item.id === 'price')).toBe(false);
    const priced = shelfLayout({ headline: 'H', cta: 'Buy', priceText: '45 EGP', productAspect: 2, rtl: true });
    const price = priced.find(item => item.id === 'price')!;
    expect(price.text).toBe('45 EGP');
    expect(price.x).toBeLessThan(540);
  });
  it('finds the alpha bounds of a cut product', () => {
    const w = 10, h = 10, data = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [[2, 3], [7, 8]]) data[(y * w + x) * 4 + 3] = 255;
    expect(alphaBounds(data, w, h)).toEqual({ left: 2, top: 3, right: 8, bottom: 9 });
    expect(alphaBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBeNull();
  });
});

describe('rate-limit runner', () => {
  it('waits and retries on rate_limit, then succeeds', async () => {
    let calls = 0; const waits: number[] = [];
    const result = await withRateLimit(async () => { calls++; if (calls < 3) throw new ProviderError('rate_limit', 429); return 'ok'; }, seconds => waits.push(seconds), 6, 12, async () => {});
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(waits).toEqual([12, 0, 12, 0]);
  });
  it('throws other errors at once and gives up after the last attempt', async () => {
    await expect(withRateLimit(async () => { throw new ProviderError('unauthorized', 401); }, undefined, 6, 0, async () => {})).rejects.toMatchObject({ code: 'unauthorized' });
    let calls = 0;
    await expect(withRateLimit(async () => { calls++; throw new ProviderError('rate_limit', 429); }, undefined, 3, 0, async () => {})).rejects.toMatchObject({ code: 'rate_limit' });
    expect(calls).toBe(3);
  });
});
