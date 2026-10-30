import { describe, it, expect } from 'vitest';
import { browserPrefersArabic } from '../../src/lib/i18n';

describe('first-visit language', () => {
  it('starts in Arabic only when the browser prefers Arabic', () => {
    expect(browserPrefersArabic(['ar-EG', 'en'])).toBe(true);
    expect(browserPrefersArabic(['ar'])).toBe(true);
    expect(browserPrefersArabic(['en-US', 'ar'])).toBe(false);
    expect(browserPrefersArabic([])).toBe(false);
    expect(browserPrefersArabic(undefined)).toBe(false);
  });
});
