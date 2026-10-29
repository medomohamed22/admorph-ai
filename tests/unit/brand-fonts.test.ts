import { describe, expect, it } from 'vitest';
import { resolveBrandFontFamily, brandFontStylesheetUrl } from '../../src/lib/brand/fonts';

describe('resolveBrandFontFamily', () => {
  it('accepts a listed family and returns its canonical casing', () => {
    expect(resolveBrandFontFamily('Montserrat')).toBe('Montserrat');
    expect(resolveBrandFontFamily('montserrat')).toBe('Montserrat');
    expect(resolveBrandFontFamily('IBM Plex Sans Arabic')).toBe('IBM Plex Sans Arabic');
  });
  it('rejects hallucinated families and non-strings', () => {
    expect(resolveBrandFontFamily('Comic Sans')).toBeNull();
    expect(resolveBrandFontFamily('')).toBeNull();
    expect(resolveBrandFontFamily(undefined)).toBeNull();
    expect(resolveBrandFontFamily(42)).toBeNull();
  });
});

describe('brandFontStylesheetUrl', () => {
  it('builds a Google Fonts URL with spaces encoded and bold included', () => {
    expect(brandFontStylesheetUrl('IBM Plex Sans Arabic')).toBe(
      'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap');
  });
});
