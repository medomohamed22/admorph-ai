import { describe, it, expect } from 'vitest';
import { initialLocale } from '../../src/lib/i18n';

describe('first-visit language', () => {
  it('starts in English unless the visitor saved Arabic', () => {
    expect(initialLocale(undefined)).toBe('en');
    expect(initialLocale('en')).toBe('en');
    expect(initialLocale('ar')).toBe('ar');
    expect(initialLocale('fr')).toBe('en');
  });
});
