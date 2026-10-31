import baseEn from '../messages/en.json';
import baseAr from '../messages/ar.json';
import studioEn from '../messages/studio.en.json';
import studioAr from '../messages/studio.ar.json';

// Studio redesign strings live in their own files and are merged over the base
// dictionaries, so both languages stay in parity and new screens stay reviewable.
function merge<B extends Record<string, unknown>, S extends Record<string, Record<string, unknown>>>(base: B, studio: S) {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(studio)) {
    const current = result[key];
    result[key] = current && typeof current === 'object' ? { ...(current as Record<string, unknown>), ...value } : value;
  }
  return result as B & { [K in keyof S]: K extends keyof B ? B[K] & S[K] : S[K] };
}

const en = merge(baseEn, studioEn);
const ar: typeof en = merge(baseAr, studioAr) as typeof en;

// Both dictionaries cover current screens. Every first visit starts in English,
// whatever the browser language (judges and new visitors see English first);
// a language the visitor picked with the AR/EN button is saved and always wins.
export const messages = { en, ar };
export const defaultLocale = 'en';
export function initialLocale(saved: unknown): 'en' | 'ar' {
  return saved === 'ar' ? 'ar' : 'en';
}
