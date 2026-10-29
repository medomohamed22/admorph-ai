/**
 * Google Fonts families the brand extraction may suggest (open license).
 * The vision model picks from these lists only, so the site never tries to
 * load a hallucinated family name. Arabic headlines need an Arabic-capable
 * family; Latin wordmarks get a Latin display family.
 */
export const LATIN_BRAND_FONTS = ['Inter', 'Montserrat', 'Poppins', 'Oswald', 'Bebas Neue', 'Playfair Display', 'DM Serif Display'] as const;
export const ARABIC_BRAND_FONTS = ['Cairo', 'Tajawal', 'Almarai', 'IBM Plex Sans Arabic', 'Noto Kufi Arabic'] as const;

/** Accept only a family from the lists above, in its canonical casing. */
export function resolveBrandFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const wanted = value.trim().toLowerCase();
  for (const family of [...LATIN_BRAND_FONTS, ...ARABIC_BRAND_FONTS]) {
    if (family.toLowerCase() === wanted) return family;
  }
  return null;
}

/** Google Fonts stylesheet for one family (regular + bold). */
export function brandFontStylesheetUrl(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=swap`;
}
