import { describe, expect, it } from 'vitest';
import { compose } from '../../src/lib/editor/composition';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { clampLayer, creativeSchema } from '../../src/lib/editor/schema';
import { dimensionsFor } from '../../src/lib/editor/sizes';
import { checkCreative } from '../../src/lib/critic/rules';

function composed(format: '1080x1350' | '1080x1080' | '1080x1920') {
  const campaign = newCampaign();
  campaign.format = format;
  const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
  const creative = compose(campaign, concept, crypto.randomUUID(), null);
  const metrics = Object.fromEntries(creative.layers.map((layer) => [layer.id, { neededHeight: 70, unrenderable: false }]));
  const assets = new Set(creative.layers.flatMap((layer) => (layer.assetId ? [layer.assetId] : [])));
  return { creative, metrics, assets };
}

describe('compose across platform sizes', () => {
  it.each(['1080x1350', '1080x1080', '1080x1920'] as const)('fills its own canvas and parses (%s)', (format) => {
    const { creative } = composed(format);
    const size = dimensionsFor(format);
    expect(creative.format).toBe(format);
    const background = creative.layers.find((layer) => layer.kind === 'background')!;
    expect([background.width, background.height]).toEqual([size.width, size.height]);
    for (const layer of creative.layers) {
      expect(layer.x + layer.width).toBeLessThanOrEqual(size.width);
      expect(layer.y + layer.height).toBeLessThanOrEqual(size.height);
    }
    expect(creativeSchema.safeParse(creative).success).toBe(true);
  });

  it('keeps the 4:5 layout byte-identical to the pre-size geometry', () => {
    const { creative } = composed('1080x1350');
    expect(creative.layers.find((layer) => layer.kind === 'cta')!).toMatchObject({ x: 180, y: 1180, width: 720, height: 100 });
    expect(creative.layers.find((layer) => layer.kind === 'product')!).toMatchObject({ x: 220, y: 510, width: 640, height: 590 });
  });
});

describe('size-aware clamping and critic', () => {
  it('clamps to the creative size, not the old fixed canvas', () => {
    const { creative } = composed('1080x1080');
    const product = creative.layers.find((layer) => layer.kind === 'product')!;
    const clamped = clampLayer(product, { y: 1000 }, dimensionsFor('1080x1080'));
    expect(clamped.y).toBe(608);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1080);
    const legacy = clampLayer(product, { y: 1000 });
    expect(legacy.y).toBe(878);
  });

  it('rejects layers outside their own size at the creative level', () => {
    const { creative } = composed('1080x1350');
    const tall = { ...creative, layers: creative.layers.map((layer) => (layer.kind === 'product' ? { ...layer, y: 0, height: 1300 } : layer)) };
    expect(creativeSchema.safeParse({ ...tall, format: '1080x1080' }).success).toBe(false);
    expect(creativeSchema.safeParse({ ...tall, format: '1080x1350' }).success).toBe(true);
  });

  it('flags a dimensions mismatch against the declared format', () => {
    const { creative, metrics, assets } = composed('1080x1350');
    const wrong = checkCreative(creative, metrics, assets, { width: 1080, height: 1080 });
    expect(wrong.issues.map((issue) => issue.code)).toContain('dimensions');
    const right = checkCreative(creative, metrics, assets, dimensionsFor(creative.format));
    expect(right.issues.map((issue) => issue.code)).not.toContain('dimensions');
  });

  it('warns when the product itself sits under platform UI chrome', () => {
    const { creative, metrics, assets } = composed('1080x1350');
    const moved = { ...creative, placement: 'feed' as const, layers: creative.layers.map((layer) => (layer.kind === 'product' ? { ...layer, y: 0 } : layer)) };
    const result = checkCreative(moved, metrics, assets, dimensionsFor(moved.format));
    const product = moved.layers.find((layer) => layer.kind === 'product')!;
    expect(result.issues.some((issue) => issue.code === 'meta_ui_occlusion' && issue.layerIds.includes(product.id))).toBe(true);
    const off = checkCreative({ ...moved, placement: 'off' }, metrics, assets, dimensionsFor(moved.format));
    expect(off.issues.map((issue) => issue.code)).not.toContain('meta_ui_occlusion');
  });
});
