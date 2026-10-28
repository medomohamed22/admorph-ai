import { describe, expect, it } from 'vitest';
import { layerSchema } from '../../src/lib/editor/schema';
import { compose } from '../../src/lib/editor/composition';
import { fitContain } from '../../src/lib/editor/fit';
import { logoBox, defaultLogoPlacement } from '../../src/lib/editor/logo-placement';
import { checkCreative } from '../../src/lib/critic/rules';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';

function composed(overrides: { creativeLanguage?: 'ar' | 'en'; logoPlacement?: boolean } = {}) {
  const campaign = newCampaign();
  if (overrides.creativeLanguage) campaign.creativeLanguage = overrides.creativeLanguage;
  if (overrides.logoPlacement) {
    campaign.brandSnapshot.logoPlacement = { ...defaultLogoPlacement, position: 'top-left' };
    campaign.brandSnapshot.logoAspectRatio = 2;
  }
  const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
  const productId = crypto.randomUUID();
  const logoId = overrides.logoPlacement ? crypto.randomUUID() : null;
  const creative = compose(campaign, concept, productId, logoId);
  return { campaign, concept, creative, productId, logoId };
}

describe('transparent text fill', () => {
  it('accepts legacy hex fills and transparent fills, rejects other values', () => {
    const base = {
      id: crypto.randomUUID(),
      kind: 'headline' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      text: 'Hi',
      color: '#000000',
      fontFamily: 'Inter' as const,
      fontSize: 48,
      visible: true,
      assetId: null,
    };
    expect(layerSchema.safeParse({ ...base, fill: '#ffffff' }).success).toBe(true);
    expect(layerSchema.safeParse({ ...base, fill: 'transparent' }).success).toBe(true);
    expect(layerSchema.safeParse({ ...base, fill: 'red' }).success).toBe(false);
  });

  it('composes brand and headline text without a background box, CTA keeps its capsule', () => {
    const { creative } = composed();
    const brand = creative.layers.find((layer) => layer.kind === 'brand')!;
    const headline = creative.layers.find((layer) => layer.kind === 'headline')!;
    const cta = creative.layers.find((layer) => layer.kind === 'cta')!;
    expect(brand.fill).toBe('transparent');
    expect(headline.fill).toBe('transparent');
    expect(cta.fill).toBe('#52633c');
    expect(cta.color).toBe('#dce5bb');
    expect(layerSchema.safeParse(brand).success).toBe(true);
  });

  it('applies the extracted wordmark weight to brand and headline layers only', () => {
    const campaign = newCampaign();
    campaign.brandSnapshot.wordmarkBold = true;
    campaign.brandSnapshot.wordmarkStyle = 'Bold geometric sans';
    const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
    const creative = compose(campaign, concept, crypto.randomUUID(), null);
    expect(creative.layers.find((layer) => layer.kind === 'brand')!.fontStyle).toBe('bold');
    expect(creative.layers.find((layer) => layer.kind === 'headline')!.fontStyle).toBe('bold');
    expect(creative.layers.find((layer) => layer.kind === 'cta')!.fontStyle).not.toBe('bold');
    const plain = compose(newCampaign(), concept, crypto.randomUUID(), null);
    expect(plain.layers.find((layer) => layer.kind === 'brand')!.fontStyle).toBe('normal');
    expect(plain.layers.find((layer) => layer.kind === 'headline')!.fontStyle).toBe('normal');
  });
  it('picks the brand-kit font by language', () => {
    const arabic = composed({ creativeLanguage: 'ar' });
    const english = composed({ creativeLanguage: 'en' });
    expect(arabic.creative.layers.find((layer) => layer.kind === 'headline')!.fontFamily).toBe('Cairo');
    expect(english.creative.layers.find((layer) => layer.kind === 'headline')!.fontFamily).toBe('Inter');
  });

  it('reports transparent-fill text contrast as unavailable, never as a false pass', () => {
    const { creative, productId } = composed();
    const result = checkCreative(creative, {}, new Set([productId]));
    const headline = creative.layers.find((layer) => layer.kind === 'headline')!;
    expect(result.issues.some((issue) => issue.code === 'contrast' && issue.layerIds.includes(headline.id))).toBe(
      false,
    );
    expect(
      result.issues.some(
        (issue) => issue.code === 'contrast_unavailable' && issue.layerIds.includes(headline.id),
      ),
    ).toBe(true);
  });
});

describe('logo placement', () => {
  it('places the logo from the brand-kit placement and aspect ratio', () => {
    const { creative, logoId } = composed({ logoPlacement: true });
    const logo = creative.layers.find((layer) => layer.kind === 'logo')!;
    expect(logo.assetId).toBe(logoId);
    const expected = logoBox({ ...defaultLogoPlacement, position: 'top-left' }, 2);
    expect({ x: logo.x, y: logo.y, width: logo.width, height: logo.height }).toEqual({
      x: expected.x,
      y: expected.y,
      width: expected.width,
      height: expected.height,
    });
  });
});

describe('contain fit', () => {
  it('fits wide and tall images without distortion, centered', () => {
    const wide = fitContain({ width: 640, height: 590 }, 800, 400);
    expect(wide).toEqual({ x: 0, y: 135, width: 640, height: 320 });
    const tall = fitContain({ width: 640, height: 590 }, 400, 800);
    expect(tall.x).toBeCloseTo(172.5);
    expect(tall.y).toBe(0);
    expect(tall.width).toBeCloseTo(295);
    expect(tall.height).toBe(590);
  });

  it('rejects invalid dimensions', () => {
    expect(() => fitContain({ width: 640, height: 590 }, 0, 400)).toThrow('invalid_dimensions');
    expect(() => fitContain({ width: 0, height: 590 }, 400, 400)).toThrow('invalid_dimensions');
  });
});
