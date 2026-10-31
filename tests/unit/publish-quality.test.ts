import { describe, expect, it } from 'vitest';
import { shelfLayout, estimateTextWidth } from '../../src/lib/shelf/mockup';
import { ONESHOT_WIDTH, ONESHOT_HEIGHT, oneshotScore, buildOneshotPrompt, verifyResultSchema, type OneshotElement } from '../../src/lib/ai/oneshot';
import { buildRemixPrompt } from '../../src/lib/ai/remix';
import { repairNotes } from '../../src/lib/agent/pipeline';
import { fitsUpload } from '../../src/lib/media/upload-rules';

const overlaps = (a: OneshotElement, b: OneshotElement) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (e: OneshotElement) => e.x >= 0 && e.y >= 0 && e.x + e.width <= ONESHOT_WIDTH && e.y + e.height <= ONESHOT_HEIGHT;

describe('shelf ad layout', () => {
  for (const [label, aspect] of [['tall can', 0.4], ['wide shoe', 2.4], ['square headphones', 0.9]] as const) {
    for (const rtl of [false, true]) it(`keeps the price and the button off the ${label} (${rtl ? 'rtl' : 'ltr'})`, () => {
      const layout = shelfLayout({ headline: 'خطوة خفيفة وشكل حلو', cta: 'اطلب دلوقتي', priceText: '1,250 EGP', productAspect: aspect, rtl });
      const product = layout.find(e => e.kind === 'product')!;
      for (const element of layout) {
        expect(inside(element)).toBe(true);
        if (element !== product) expect(overlaps(element, product)).toBe(false);
      }
      const price = layout.find(e => e.id === 'price')!, cta = layout.find(e => e.id === 'cta')!;
      expect(price.badge).toBe('price'); expect(cta.badge).toBe('cta');
      expect(overlaps(price, cta)).toBe(false);
    });
  }
  it('sizes each badge to its own words', () => {
    const short = shelfLayout({ headline: 'H', cta: 'Buy', priceText: '45 EGP', productAspect: 1, rtl: false });
    const long = shelfLayout({ headline: 'H', cta: 'Order yours today', priceText: '12,900 EGP', productAspect: 1, rtl: false });
    expect(long.find(e => e.id === 'cta')!.width).toBeGreaterThan(short.find(e => e.id === 'cta')!.width);
    expect(long.find(e => e.id === 'price')!.width).toBeGreaterThan(short.find(e => e.id === 'price')!.width);
    expect(estimateTextWidth('اطلب الآن', 44)).toBeGreaterThan(0);
  });
  it('leaves the price out when there is none', () => {
    expect(shelfLayout({ headline: 'H', cta: 'Buy', priceText: ' ', productAspect: 1, rtl: false }).some(e => e.id === 'price')).toBe(false);
  });
});

describe('publish-ready rules', () => {
  const brand = { name: 'Sora', description: 'tea', colors: ['#52633C', '#DCE5BB', '#F2D1BC'] as [string, string, string] };
  it('every ad prompt carries the readability and clearance rules', () => {
    const layout: OneshotElement[] = [{ id: 'p', kind: 'product', x: 300, y: 300, width: 400, height: 500 }, { id: 'h', kind: 'text', x: 80, y: 80, width: 900, height: 120, text: 'Hi' }];
    for (const prompt of [buildOneshotPrompt(brand, 'a cafe', layout, 'en'), buildRemixPrompt(brand, 'a cafe', 'Hi', 'en', 'product', 'ramadan')]) {
      expect(prompt).toContain('light text only over dark, calm areas');
      expect(prompt).toContain('Never let any text, price tag or button touch, overlap or hide the product');
      expect(prompt).toContain('sized to its own words');
    }
    expect(buildOneshotPrompt(brand, 'a cafe', [layout[0]], 'en')).not.toContain('Never let any text');
  });
  it('the critic scores and repairs unreadable or product-covering text', () => {
    const base = verifyResultSchema.parse({ productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [] });
    expect(oneshotScore(base, false)).toBe(100);
    const bad = { ...base, textReadable: false, textClearOfProduct: false, qualityNote: 'white price on a white wall' };
    expect(oneshotScore(bad, false)).toBe(70);
    const notes = repairNotes(bad, false);
    expect(notes.some(note => note.includes('Make every word readable') && note.includes('white price on a white wall'))).toBe(true);
    expect(notes.some(note => note.includes('off the product'))).toBe(true);
  });
});

describe('large uploads', () => {
  it('only touches photos over 2 MB or 4096 px', () => {
    expect(fitsUpload(1_500_000, 3000, 2000)).toBe(true);
    expect(fitsUpload(6_000_000, 4000, 3000)).toBe(false);
    expect(fitsUpload(1_000_000, 6000, 4000)).toBe(false);
  });
});
