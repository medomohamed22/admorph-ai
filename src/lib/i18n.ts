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

// Both dictionaries cover current screens. A first visit uses Arabic when the
// browser prefers it and English otherwise; a saved choice always wins.
export const messages = { en, ar };
export const defaultLocale = 'en';
export function browserPrefersArabic(languages: readonly string[] | undefined = typeof navigator === 'undefined' ? undefined : navigator.languages) {
  return !!languages?.[0]?.toLowerCase().startsWith('ar');
}
