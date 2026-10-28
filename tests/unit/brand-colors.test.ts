import { describe, expect, it } from 'vitest';
import { darkestBrandColor, lightestBrandColor, ctaBrandPair } from '../../src/lib/editor/brand-colors';

const TALJ: [string, string, string] = ['#16100C', '#F5EEDF', '#7ED3E0'];
const SORA: [string, string, string] = ['#52633c', '#dce5bb', '#f2d1bc'];

describe('brand colors', () => {
  it('picks the darkest and lightest palette colors by luminance', () => {
    expect(darkestBrandColor(TALJ)).toBe('#16100C');
    expect(lightestBrandColor(TALJ)).toBe('#F5EEDF');
    expect(darkestBrandColor(SORA)).toBe('#52633c');
    expect(lightestBrandColor(SORA)).toBe('#dce5bb');
  });

  it('pairs the darkest button with the lightest readable text', () => {
    expect(ctaBrandPair(TALJ)).toEqual({ fill: '#16100C', color: '#F5EEDF' });
    expect(ctaBrandPair(SORA)).toEqual({ fill: '#52633c', color: '#dce5bb' });
  });

  it('falls back to black or white text when no brand text reads on the button', () => {
    expect(ctaBrandPair(['#333333', '#444444', '#555555'])).toEqual({ fill: '#333333', color: '#ffffff' });
  });

  it('keeps the old default for a degenerate single-color palette', () => {
    expect(ctaBrandPair(['#123456', '#123456', '#123456'])).toEqual({ fill: '#253b2b', color: '#ffffff' });
  });
});
