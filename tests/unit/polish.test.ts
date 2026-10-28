import { describe, expect, it } from 'vitest';
import { shadowBox, reflectionBox } from '../../src/lib/editor/polish';
import { compose } from '../../src/lib/editor/composition';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { creativeSchema } from '../../src/lib/editor/schema';
import { checkCreative } from '../../src/lib/critic/rules';
import { dimensionsFor } from '../../src/lib/editor/sizes';

const size = { width: 1080, height: 1350 };
const product = { x: 220, y: 510, width: 640, height: 590 };

describe('polish geometry', () => {
  it('centers the shadow under the product and keeps it inside the canvas', () => {
    const shadow = shadowBox(product, size)!;
    expect(shadow.cx).toBe(product.x + product.width / 2);
    expect(shadow.cy).toBeGreaterThan(product.y + product.height);
    expect(shadow.cx - shadow.rx).toBeGreaterThanOrEqual(0);
    expect(shadow.cx + shadow.rx).toBeLessThanOrEqual(size.width);
    expect(shadow.cy + shadow.ry).toBeLessThanOrEqual(size.height);
  });

  it('returns no shadow or reflection when the product touches the bottom', () => {
    const bottom = { x: 100, y: 1000, width: 400, height: 350 };
    expect(shadowBox(bottom, size)).toBeNull();
    expect(reflectionBox(bottom, size)).toBeNull();
  });

  it('places a 35% reflection strip below the product, clamped to the canvas', () => {
    const reflection = reflectionBox(product, size)!;
    expect(reflection).toEqual({ x: product.x, y: product.y + product.height + 8, width: product.width, height: product.height * 0.35 });
    const low = { x: 100, y: 1000, width: 400, height: 300 };
    const clamped = reflectionBox(low, size)!;
    expect(clamped.y + clamped.height).toBe(size.height);
  });
});

describe('polish schema and critic invariance', () => {
  it('parses valid polish and rejects a non-hex grade', () => {
    const campaign = newCampaign();
    const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
    const creative = compose(campaign, concept, crypto.randomUUID(), null);
    expect(creativeSchema.safeParse({ ...creative, polish: { shadow: true, reflection: true, grade: '#16100C' } }).success).toBe(true);
    expect(creativeSchema.safeParse({ ...creative, polish: { shadow: true, reflection: false, grade: 'red' } }).success).toBe(false);
    expect(creativeSchema.safeParse({ ...creative, polish: { shadow: true, reflection: false, grade: null } }).success).toBe(true);
  });

  it('adds no critic findings: polish is display-only, product pixels untouched', () => {
    const campaign = newCampaign();
    const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
    const creative = compose(campaign, concept, crypto.randomUUID(), null);
    const metrics = Object.fromEntries(creative.layers.map((layer) => [layer.id, { neededHeight: 70, unrenderable: false }]));
    const assets = new Set(creative.layers.flatMap((layer) => (layer.assetId ? [layer.assetId] : [])));
    const before = checkCreative(creative, metrics, assets, dimensionsFor(creative.format));
    const after = checkCreative({ ...creative, polish: { shadow: true, reflection: true, grade: '#16100C' } }, metrics, assets, dimensionsFor(creative.format));
    expect(after.issues.map((issue) => issue.code)).toEqual(before.issues.map((issue) => issue.code));
  });
});
