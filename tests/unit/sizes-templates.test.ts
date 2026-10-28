import { describe, expect, it } from 'vitest';
import { dimensionsFor, formatLabel, SIZE_FORMATS } from '../../src/lib/editor/sizes';
import { applyTemplate, TEMPLATE_IDS, type TemplateId } from '../../src/lib/editor/templates';
import type { EditableLayer } from '../../src/lib/editor/schema';

function fixtureLayers(): EditableLayer[] {
  const base = { fontFamily: 'Inter' as const, fontSize: 40, visible: true, assetId: null, color: '#111111', fill: '#ffffff', text: 'Test' };
  const layer = (kind: EditableLayer['kind'], x: number, y: number, width: number, height: number, patch: Partial<EditableLayer> = {}): EditableLayer =>
    ({ ...base, id: crypto.randomUUID(), kind, x, y, width, height, ...patch });
  return [
    layer('background', 0, 0, 1080, 1350, { text: '' }),
    layer('brand', 75, 60, 700, 90, { text: 'TALJ' }),
    layer('logo', 850, 55, 150, 120, { assetId: crypto.randomUUID(), text: '' }),
    layer('headline', 75, 205, 930, 265, { text: 'Ice-cold. Always.' }),
    layer('product', 220, 510, 640, 590, { assetId: crypto.randomUUID(), text: '' }),
    layer('cta', 180, 1180, 720, 100, { text: 'Discover more' }),
  ];
}

describe('platform sizes', () => {
  it('maps formats to dimensions and defaults old records to 4:5', () => {
    expect(dimensionsFor('1080x1350')).toEqual({ width: 1080, height: 1350 });
    expect(dimensionsFor('1080x1080')).toEqual({ width: 1080, height: 1080 });
    expect(dimensionsFor('1080x1920')).toEqual({ width: 1080, height: 1920 });
    expect(dimensionsFor(undefined)).toEqual({ width: 1080, height: 1350 });
    expect(dimensionsFor(null)).toEqual({ width: 1080, height: 1350 });
    expect(formatLabel('1080x1080')).toBe('1080 × 1080 · 1:1');
    expect(SIZE_FORMATS).toEqual(['1080x1350', '1080x1080', '1080x1920']);
  });
});

describe('layout templates', () => {
  it.each(TEMPLATE_IDS)('keeps every layer inside the canvas for every size (%s)', (template: TemplateId) => {
    for (const format of SIZE_FORMATS) {
      const size = dimensionsFor(format);
      const result = applyTemplate(fixtureLayers(), template, size);
      const background = result.find((layer) => layer.kind === 'background')!;
      expect([background.x, background.y, background.width, background.height]).toEqual([0, 0, size.width, size.height]);
      for (const layer of result) {
        expect(layer.x).toBeGreaterThanOrEqual(0);
        expect(layer.y).toBeGreaterThanOrEqual(0);
        expect(layer.x + layer.width).toBeLessThanOrEqual(size.width);
        expect(layer.y + layer.height).toBeLessThanOrEqual(size.height);
      }
    }
  });

  it('preserves text, colors, fonts, images and visibility', () => {
    const before = fixtureLayers();
    const after = applyTemplate(before, 'split', dimensionsFor('1080x1920'));
    for (const layer of after) {
      const original = before.find((item) => item.id === layer.id)!;
      expect(layer.text).toBe(original.text);
      expect(layer.color).toBe(original.color);
      expect(layer.fontFamily).toBe(original.fontFamily);
      expect(layer.assetId).toBe(original.assetId);
      expect(layer.visible).toBe(original.visible);
    }
  });

  it('centers the product for hero-center, splits copy from product, and maximizes the product for minimal', () => {
    const size = dimensionsFor('1080x1350');
    const hero = applyTemplate(fixtureLayers(), 'hero-center', size);
    const heroProduct = hero.find((layer) => layer.kind === 'product')!;
    expect(Math.abs(heroProduct.x - (size.width - heroProduct.width) / 2)).toBeLessThanOrEqual(2);
    const split = applyTemplate(fixtureLayers(), 'split', size);
    const headline = split.find((layer) => layer.kind === 'headline')!;
    const product = split.find((layer) => layer.kind === 'product')!;
    expect(headline.x + headline.width).toBeLessThanOrEqual(product.x);
    const minimal = applyTemplate(fixtureLayers(), 'minimal', size);
    const minimalProduct = minimal.find((layer) => layer.kind === 'product')!;
    const minimalHeadline = minimal.find((layer) => layer.kind === 'headline')!;
    expect(minimalProduct.width * minimalProduct.height).toBeGreaterThan(minimalHeadline.width * minimalHeadline.height);
  });
});
