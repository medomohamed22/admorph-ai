import { describe, expect, it } from 'vitest';
import { sampleColors } from '../../src/lib/brand/sample-colors';
import { SEASON_FALLBACK_HEADLINE, seasonFallbackScene, NEUTRAL_VARIANT_SCENES, REMIX_THEMES } from '../../src/lib/ai/remix';

describe('colors measured on the device', () => {
  it('finds the main colors and where they sit', () => {
    const width = 40, height = 20, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, left = x < 30;
      data.set(left ? [230, 60, 40, 255] : [20, 40, 160, 255], i);
    }
    const colors = sampleColors({ data, width, height });
    expect(colors.map(color => color.hex)).toEqual(['#e63c28', '#1428a0']);
    expect(colors[0].x).toBeCloseTo(14.5 / 40, 1);
    expect(colors[1].x).toBeCloseTo(34.5 / 40, 1);
    expect(colors[0].share).toBeCloseTo(0.75, 2);
  });
  it('skips transparent pixels and near-duplicate colors', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < 16; i++) data.set(i < 8 ? [100, 100, 100, 255] : i < 12 ? [110, 104, 100, 255] : [0, 0, 0, 0], i * 4);
    expect(sampleColors({ data, width: 4, height: 4 })).toHaveLength(1);
  });
});

describe('seasonal fallbacks when Meta refuses', () => {
  it('has a plain greeting in both languages and a props-only scene for every season', () => {
    for (const theme of REMIX_THEMES) {
      expect(SEASON_FALLBACK_HEADLINE[theme.id].en.length).toBeGreaterThan(3);
      expect(SEASON_FALLBACK_HEADLINE[theme.id].ar).toMatch(/[؀-ۿ]/);
      expect(seasonFallbackScene(theme.id)).toContain(theme.cues[0]);
    }
    expect(NEUTRAL_VARIANT_SCENES).toHaveLength(3);
  });
});
