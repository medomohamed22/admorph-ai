import { describe, it, expect } from 'vitest';
import { PLAN_DIALECTS, DIALECT_PROMPT, DIALECT_EXAMPLE, dialectLanguage } from '../../src/lib/campaign/dialects';
import { planRequestSchema } from '../../src/lib/campaign/schema';

const base = { providerId: 'meta', apiKey: 'fixture-key', modelId: 'muse-spark-1.3-contributor', consent: true, imageConsent: true, brand: { name: 'Sora', description: 'Tea', colors: ['#111111', '#222222', '#333333'] }, brief: '', goal: 'awareness', creativeLanguage: 'ar', format: '1080x1350', product: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } };

describe('copy dialects', () => {
  it('covers Egyptian, Gulf, Levantine, Sudanese, Standard Arabic and English with a prompt and a sample each', () => {
    expect([...PLAN_DIALECTS]).toEqual(['ar_eg', 'ar_gulf', 'ar_lev', 'ar_sd', 'ar_msa', 'en']);
    for (const dialect of PLAN_DIALECTS) {
      expect(DIALECT_PROMPT[dialect].length).toBeGreaterThan(5);
      expect(DIALECT_EXAMPLE[dialect].length).toBeGreaterThan(5);
    }
    expect(dialectLanguage('ar_sd')).toBe('ar');
    expect(dialectLanguage('en')).toBe('en');
  });
  it('the plan request accepts a known dialect, stays valid without one, and rejects anything else', () => {
    expect(planRequestSchema.safeParse(base).success).toBe(true);
    expect(planRequestSchema.safeParse({ ...base, dialect: 'ar_gulf' }).success).toBe(true);
    expect(planRequestSchema.safeParse({ ...base, dialect: 'ar_xx' }).success).toBe(false);
  });
});
