import { describe, expect, it } from 'vitest';
import {
  ONESHOT_WIDTH, ONESHOT_HEIGHT,
  oneshotRequestSchema, verifyResultSchema,
  zoneOf, buildOneshotPrompt, oneshotScore,
  type OneshotElement, type VerifyResult,
} from '../../src/lib/ai/oneshot';

const BRAND = { name: 'NOUR', description: 'Cold brew coffee', colors: ['#16100C', '#F5EEDF', '#7ED3E0'] as [string, string, string] };
const IMAGE = { mimeType: 'image/png' as const, data: 'iVBORw0KGgo=' };
const BASE = { providerId: 'meta' as const, apiKey: 'k', modelId: 'muse-image-1.0', consent: true as const, imageConsent: true as const };

function element(partial: Partial<OneshotElement>): OneshotElement {
  return { id: 'e1', kind: 'product', x: 390, y: 400, width: 300, height: 550, ...partial };
}

describe('zoneOf', () => {
  it('names corners and the center', () => {
    expect(zoneOf(element({ x: 0, y: 0, width: 100, height: 100 }))).toBe('top left');
    expect(zoneOf(element({ x: 980, y: 0, width: 100, height: 100 }))).toBe('top right');
    expect(zoneOf(element({ x: 390, y: 600, width: 300, height: 150 }))).toBe('center');
    expect(zoneOf(element({ x: 0, y: 1250, width: 100, height: 100 }))).toBe('bottom left');
    expect(zoneOf(element({ x: 490, y: 0, width: 100, height: 100 }))).toBe('top');
  });
  it('uses the 1080x1350 frame', () => {
    expect(ONESHOT_WIDTH).toBe(1080);
    expect(ONESHOT_HEIGHT).toBe(1350);
  });
});

describe('buildOneshotPrompt', () => {
  it('pins every element to its zone and quotes its text exactly', () => {
    const layout = [
      element({ id: 'p', kind: 'product', x: 390, y: 400, width: 300, height: 550 }),
      element({ id: 'l', kind: 'logo', x: 830, y: 40, width: 200, height: 80 }),
      element({ id: 'h', kind: 'text', x: 140, y: 120, width: 800, height: 120, text: 'ساقعة تنعشك' }),
      element({ id: 'ph', kind: 'phone', x: 340, y: 1200, width: 400, height: 60, text: '01012345678' }),
    ];
    const prompt = buildOneshotPrompt(BRAND, 'sunset beach', layout, 'ar');
    expect(prompt).toContain('The product stays center');
    expect(prompt).toContain('The logo stays top right');
    expect(prompt).toContain('The text "ساقعة تنعشك" stays top');
    expect(prompt).toContain('The phone number "01012345678" stays bottom');
    expect(prompt).toContain('every digit must be exactly as written');
    expect(prompt).toContain('Background: sunset beach.');
    expect(prompt).toContain('Brand: NOUR. Brand colors: #16100C, #F5EEDF, #7ED3E0.');
    expect(prompt).toContain('No extra text, no extra logos');
  });
  it('never invents text for image elements', () => {
    const prompt = buildOneshotPrompt(BRAND, 'cafe', [element({ id: 'p', kind: 'product' })], 'en');
    expect(prompt).not.toContain('""');
  });
});

describe('oneshot request schema', () => {
  it('accepts a full mockup request and rejects a missing mockup', () => {
    expect(oneshotRequestSchema.safeParse({ ...BASE, mockup: IMAGE, brand: BRAND, scene: 'beach', language: 'ar', layout: [element({})] }).success).toBe(true);
    expect(oneshotRequestSchema.safeParse({ ...BASE, brand: BRAND, scene: 'beach', language: 'ar', layout: [element({})] }).success).toBe(false);
  });
  it('rejects an empty layout, a 13th element, and an out-of-frame box', () => {
    expect(oneshotRequestSchema.safeParse({ ...BASE, mockup: IMAGE, brand: BRAND, scene: 's', language: 'en', layout: [] }).success).toBe(false);
    expect(oneshotRequestSchema.safeParse({ ...BASE, mockup: IMAGE, brand: BRAND, scene: 's', language: 'en', layout: Array.from({ length: 13 }, (_, i) => element({ id: `e${i}` })) }).success).toBe(false);
    expect(oneshotRequestSchema.safeParse({ ...BASE, mockup: IMAGE, brand: BRAND, scene: 's', language: 'en', layout: [element({ x: 2000 })] }).success).toBe(false);
  });
});

describe('oneshotScore', () => {
  const full: VerifyResult = { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [{ id: 'h', expected: 'a', found: 'a', match: true }] };
  it('scores a perfect certificate 100', () => {
    expect(oneshotScore(full, true)).toBe(100);
    expect(oneshotScore({ ...full, logoKept: false }, false)).toBe(100);
  });
  it('punishes a lost product more than a lost text', () => {
    const noProduct = oneshotScore({ ...full, productKept: false }, true);
    const noText = oneshotScore({ ...full, texts: [{ id: 'h', expected: 'a', found: 'b', match: false }] }, true);
    expect(noProduct).toBe(60);
    expect(noText).toBe(75);
    expect(noProduct).toBeLessThan(noText);
  });
  it('gives full text marks when there is nothing to check', () => {
    expect(oneshotScore({ ...full, texts: [] }, true)).toBe(100);
  });
});

describe('verifyResultSchema', () => {
  it('parses a certificate payload', () => {
    expect(verifyResultSchema.safeParse({ productKept: true, productNote: 'same can', logoKept: true, logoNote: '', layoutKept: false, layoutNote: 'logo moved', texts: [] }).success).toBe(true);
  });
});
