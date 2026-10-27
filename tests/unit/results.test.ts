import { describe, expect, it } from 'vitest';
import { buildResults, buildTaglineCandidates } from '../../src/lib/auto-run/results';
import { buildBackgroundBrief } from '../../src/lib/background/brief';
import { composeAutoAd } from '../../src/lib/auto-run/compose';

const PALETTE: [string, string, string] = ['#16100C', '#F5EEDF', '#7ED3E0'];

describe('tagline candidates', () => {
  it('returns three distinct template lines from user words only', () => {
    const candidates = buildTaglineCandidates(
      'TALJ',
      'canned cold brew',
      'fresh, premium',
      'Ice-cold canned coffee.',
    );
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates).size).toBe(3);
    expect(candidates[0]).toBe('TALJ · canned cold brew');
    expect(candidates[1]).toBe('TALJ — Ice-cold canned coffee.');
  });

  it('stays distinct when the description is empty', () => {
    const candidates = buildTaglineCandidates('TALJ', 'canned cold brew', 'fresh, premium');
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates).size).toBe(3);
  });
});

describe('results set', () => {
  it('builds a hero plus three variants with distinct presets and taglines', () => {
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
    const results = buildResults({
      brandName: 'TALJ',
      brandColors: PALETTE,
      brandDescription: 'Ice-cold canned coffee.',
      productCategory: 'canned cold brew',
      stylePreset: 'hero',
      hero,
      tagline: 'TALJ · canned cold brew',
      caption: 'TALJ — canned cold brew',
      cta: 'Discover more',
      cutoutAssetId: crypto.randomUUID(),
      backgroundAssetId: crypto.randomUUID(),
      sceneMood: 'fresh, premium',
    });
    expect(results).toHaveLength(4);
    expect(results[0].preset).toBe('hero');
    expect(results[0].hero).toEqual(hero);
    expect(results.map((result) => result.preset)).toEqual([
      'hero',
      'hero',
      'dynamic',
      'minimal',
    ]);
    expect(new Set(results.map((result) => result.tagline)).size).toBe(3);
    expect(results.every((result) => result.caption.length <= 1200)).toBe(true);
  });
});
