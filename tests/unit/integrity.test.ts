import { describe, expect, it } from 'vitest';
import {
  checkResultProvenance,
  isResultModified,
  qualityLabel,
  verifyProductPixels,
} from '../../src/lib/auto-run/integrity';
import { buildResults } from '../../src/lib/auto-run/results';
import { buildBackgroundBrief } from '../../src/lib/background/brief';
import { composeAutoAd } from '../../src/lib/auto-run/compose';
import type { AutoRunRecord } from '../../src/lib/auto-run/runner';

const PALETTE: [string, string, string] = ['#16100C', '#F5EEDF', '#7ED3E0'];

function imageData(width: number, height: number, fill: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = fill(x, y);
      data.set(pixel, (y * width + x) * 4);
    }
  }
  return { width, height, data } as ImageData;
}

describe('product pixel preservation', () => {
  it('passes when only alpha changed and fails on a redrawn pixel', () => {
    const original = imageData(2, 1, (x) => [10 * x, 20, 30, 255]);
    const cutout = imageData(2, 1, (x) => [10 * x, 20, 30, x === 0 ? 255 : 0]);
    expect(verifyProductPixels(original, cutout)).toEqual({
      preserved: true,
      mismatchedPixels: 0,
      totalPixels: 2,
    });
    const redrawn = imageData(2, 1, (x) => [x === 0 ? 99 : 10, 20, 30, 255]);
    const check = verifyProductPixels(original, redrawn);
    expect(check.preserved).toBe(false);
    expect(check.mismatchedPixels).toBe(1);
    expect(verifyProductPixels(original, imageData(3, 1, () => [0, 0, 0, 255])).preserved).toBe(
      false,
    );
  });
});

describe('result quality labels', () => {
  function fixture() {
    const brief = buildBackgroundBrief({
      productCategory: 'canned cold brew',
      typeHint: 'can',
      brandColors: PALETTE,
      stylePreset: 'hero',
    });
    const cutoutId = crypto.randomUUID();
    const backgroundId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const hero = composeAutoAd({
      brandName: 'TALJ',
      brandColors: PALETTE,
      brief,
      cutoutAssetId: cutoutId,
      backgroundAssetId: backgroundId,
      tagline: 'TALJ · canned cold brew',
      caption: 'TALJ — canned cold brew',
      cta: 'Discover more',
    });
    const results = buildResults({
      brandName: 'TALJ',
      brandColors: PALETTE,
      brandDescription: '',
      productCategory: 'canned cold brew',
      stylePreset: 'hero',
      hero,
      tagline: 'TALJ · canned cold brew',
      caption: 'TALJ — canned cold brew',
      cta: 'Discover more',
      cutoutAssetId: cutoutId,
      backgroundAssetId: backgroundId,
      sceneMood: 'fresh, premium',
    });
    const run = {
      cutoutAssetId: cutoutId,
      productAssetId: productId,
    } as AutoRunRecord;
    const assets = new Map([
      [cutoutId, { kind: 'cutout' as const, derivedFrom: productId, provider: 'local' }],
      [backgroundId, { kind: 'background' as const }],
    ]);
    return { run, result: results[0], assets };
  }

  it('verifies a clean result and flags provenance, modification and pixels', () => {
    const { run, result, assets } = fixture();
    expect(checkResultProvenance(run, result, assets)).toEqual([]);
    expect(isResultModified(result, 'TALJ — canned cold brew')).toBe(false);
    expect(
      qualityLabel({ preserved: true, mismatchedPixels: 0, totalPixels: 4 }, [], false),
    ).toBe('verified');
    expect(qualityLabel(null, [], false)).toBe('not_checked');
    expect(
      qualityLabel({ preserved: true, mismatchedPixels: 0, totalPixels: 4 }, [], true),
    ).toBe('modified');
    expect(
      qualityLabel({ preserved: false, mismatchedPixels: 1, totalPixels: 4 }, [], false),
    ).toBe('warning');
    const tampered = {
      ...result,
      hero: {
        ...result.hero,
        layers: result.hero.layers.map((layer) =>
          layer.kind === 'headline' ? { ...layer, fill: '#ffffff' } : layer,
        ),
      },
    };
    expect(checkResultProvenance(run, tampered, assets)).toContain('text_box');
    expect(
      qualityLabel({ preserved: true, mismatchedPixels: 0, totalPixels: 4 }, ['text_box'], false),
    ).toBe('warning');
  });
});
