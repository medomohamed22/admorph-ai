import { describe, expect, it } from 'vitest';
import {
  autoRunRecordSchema,
  createRun,
  finishRun,
  markStep,
  nextPendingStep,
  preflight,
  resetFrom,
} from '../../src/lib/auto-run/runner';
import { buildAutoCopy, composeAutoAd, ctaRect } from '../../src/lib/auto-run/compose';
import { buildBackgroundBrief } from '../../src/lib/background/brief';
import { layerSchema } from '../../src/lib/editor/schema';

const PALETTE: [string, string, string] = ['#16100C', '#F5EEDF', '#7ED3E0'];

function runInput() {
  return {
    brandName: 'TALJ',
    brandColors: PALETTE,
    brandDescription: 'Ice-cold canned coffee.',
    productCategory: 'canned cold brew',
    stylePreset: 'hero' as const,
  };
}

describe('auto-run state machine', () => {
  it('starts with six pending steps and validates synchronously', () => {
    expect(preflight({ brandName: '', brandColors: PALETTE })).toEqual(['brandName']);
    expect(preflight({ brandName: 'TALJ', brandColors: ['#fff', '#F5EEDF', '#7ED3E0'] })).toEqual([
      'colors',
    ]);
    expect(preflight({ brandName: 'TALJ', brandColors: PALETTE })).toEqual([]);
    const run = createRun(runInput());
    expect(run.steps.map((step) => step.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(run.status).toBe('running');
    expect(autoRunRecordSchema.safeParse(run).success).toBe(true);
  });

  it('marks steps, finishes, and retries from the failed step only', () => {
    let run = createRun(runInput());
    run = markStep(run, 'cutout', 'done');
    run = markStep(run, 'analysis', 'done');
    run = markStep(run, 'backgrounds', 'failed', 'encode_failed');
    run = finishRun(run, 'failed', 'encode_failed');
    expect(nextPendingStep(run)).toBe('composition');
    const retried = resetFrom(run, 'backgrounds');
    expect(retried.status).toBe('running');
    expect(retried.steps.map((step) => step.status)).toEqual([
      'done',
      'done',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(autoRunRecordSchema.safeParse(retried).success).toBe(true);
  });
});

describe('auto-run hero composition', () => {
  it('builds copy from the brand words only', () => {
    expect(buildAutoCopy('TALJ', 'canned cold brew', 'Ice-cold canned coffee.')).toEqual({
      tagline: 'TALJ · canned cold brew',
      caption: 'TALJ — Ice-cold canned coffee.',
    });
    expect(buildAutoCopy('TALJ', 'canned cold brew')).toEqual({
      tagline: 'TALJ · canned cold brew',
      caption: 'TALJ — canned cold brew',
    });
  });

  it('keeps the CTA out of the product zone for every preset', () => {
    (['hero', 'dynamic', 'minimal'] as const).forEach((stylePreset) => {
      const brief = buildBackgroundBrief({
        productCategory: 'canned cold brew',
        typeHint: 'can',
        brandColors: PALETTE,
        stylePreset,
      });
      const cta = ctaRect(brief);
      const product = brief.reservedProductRect;
      const overlaps =
        cta.x < product.x + product.width &&
        product.x < cta.x + cta.width &&
        cta.y < product.y + product.height &&
        product.y < cta.y + cta.height;
      expect(overlaps).toBe(false);
      expect(cta.y + cta.height).toBeLessThanOrEqual(1350);
    });
  });

  it('composes a valid hero with the brief product zone and transparent text', () => {
    const brief = buildBackgroundBrief({
      productCategory: 'canned cold brew',
      typeHint: 'can',
      brandColors: PALETTE,
      stylePreset: 'hero',
    });
    const hero = composeAutoAd({
      brandName: 'TALJ',
      brandColors: PALETTE,
      brief,
      cutoutAssetId: crypto.randomUUID(),
      backgroundAssetId: crypto.randomUUID(),
      tagline: 'TALJ · canned cold brew',
      caption: 'TALJ — canned cold brew',
      cta: 'Discover more',
    });
    const kinds = hero.layers.map((layer) => layer.kind);
    expect(kinds).toEqual(['background', 'brand', 'headline', 'product', 'cta']);
    const product = hero.layers.find((layer) => layer.kind === 'product')!;
    expect({ x: product.x, y: product.y, width: product.width, height: product.height }).toEqual(
      brief.reservedProductRect,
    );
    expect(hero.layers.find((layer) => layer.kind === 'headline')!.fill).toBe('transparent');
    expect(hero.layers.find((layer) => layer.kind === 'cta')!.fill).toBe('#16100C');
    expect(hero.layers.find((layer) => layer.kind === 'cta')!.color).toBe('#F5EEDF');
    expect(hero.layers.every((layer) => layerSchema.safeParse(layer).success)).toBe(true);
  });

  it('picks Cairo for Arabic copy and Inter otherwise', () => {
    const brief = buildBackgroundBrief({
      productCategory: 'canned cold brew',
      typeHint: 'can',
      brandColors: PALETTE,
      stylePreset: 'hero',
    });
    const base = {
      brandName: 'TALJ',
      brandColors: PALETTE,
      brief,
      cutoutAssetId: crypto.randomUUID(),
      backgroundAssetId: crypto.randomUUID(),
      caption: '',
      cta: 'Discover more',
    };
    const arabic = composeAutoAd({ ...base, tagline: 'تلج · قهوة باردة' });
    expect(arabic.layers.find((layer) => layer.kind === 'headline')!.fontFamily).toBe('Cairo');
    const english = composeAutoAd({ ...base, tagline: 'TALJ · canned cold brew' });
    expect(english.layers.find((layer) => layer.kind === 'headline')!.fontFamily).toBe('Inter');
  });
});
