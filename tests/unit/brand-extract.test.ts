import { describe, expect, it } from 'vitest';
import { extractedSchema } from '../../src/lib/ai/meta-contracts';
import { brandInputSchema } from '../../src/lib/db/schema';

const base = {
  suggestedName: 'TALJ',
  primaryHex: '#16100C',
  secondaryHex: '#F5EEDF',
  accentHex: '#7ED3E0',
  brandTone: 'Ice-cold',
  shortDescriptionEn: 'Canned cold brew.',
  shortDescriptionAr: 'قهوة باردة معلبة.',
  recommendedFontEn: 'Inter',
  recommendedFontAr: 'Cairo',
  rationale: 'Seen on the can.',
};

describe('brand extraction font fields', () => {
  it('parses a suggestion carrying the wordmark font style and weight', () => {
    const parsed = extractedSchema.safeParse({ ...base, wordmarkStyle: 'Bold geometric sans', wordmarkBold: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.wordmarkStyle).toBe('Bold geometric sans');
      expect(parsed.data.wordmarkBold).toBe(true);
    }
  });

  it('keeps the wordmark fields optional for older model responses', () => {
    expect(extractedSchema.safeParse(base).success).toBe(true);
  });

  it('stores the wordmark fields on the brand', () => {
    const parsed = brandInputSchema.safeParse({
      name: 'TALJ',
      description: 'Canned cold brew.',
      colors: ['#16100C', '#F5EEDF', '#7ED3E0'],
      wordmarkStyle: 'Bold geometric sans',
      wordmarkBold: true,
    });
    expect(parsed.success).toBe(true);
  });
});
