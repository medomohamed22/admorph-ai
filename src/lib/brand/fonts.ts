/**
 * Google Fonts families the brand extraction may suggest (open license).
 * The vision model picks from these lists only, so the site never tries to
 * load a hallucinated family name. Arabic headlines need an Arabic-capable
 * family; Latin wordmarks get a Latin display family.
 */
export type BrandFont = { family: string; script: 'latin' | 'arabic'; style: 'sans' | 'display' | 'serif' | 'rounded'; weights: readonly number[] };

/**
 * The curated headline fonts. Each family is checked against Google Fonts
 * with the weights it really ships (asking css2 for a missing weight fails
 * the whole stylesheet), so the picker never loads a broken font.
 */
export const BRAND_FONTS: readonly BrandFont[] = [
  { family: 'Inter', script: 'latin', style: 'sans', weights: [400, 700] },
  { family: 'Montserrat', script: 'latin', style: 'sans', weights: [400, 700] },
  { family: 'Poppins', script: 'latin', style: 'sans', weights: [400, 700] },
  { family: 'Space Grotesk', script: 'latin', style: 'sans', weights: [400, 700] },
  { family: 'Oswald', script: 'latin', style: 'display', weights: [400, 700] },
  { family: 'Bebas Neue', script: 'latin', style: 'display', weights: [400] },
  { family: 'Archivo Black', script: 'latin', style: 'display', weights: [400] },
  { family: 'Righteous', script: 'latin', style: 'rounded', weights: [400] },
  { family: 'Playfair Display', script: 'latin', style: 'serif', weights: [400, 700] },
  { family: 'DM Serif Display', script: 'latin', style: 'serif', weights: [400] },
  { family: 'Abril Fatface', script: 'latin', style: 'serif', weights: [400] },
  { family: 'Fraunces', script: 'latin', style: 'serif', weights: [400, 700] },
  { family: 'Cairo', script: 'arabic', style: 'sans', weights: [400, 700] },
  { family: 'Tajawal', script: 'arabic', style: 'sans', weights: [400, 700] },
  { family: 'Almarai', script: 'arabic', style: 'sans', weights: [400, 700] },
  { family: 'IBM Plex Sans Arabic', script: 'arabic', style: 'sans', weights: [400, 700] },
  { family: 'Noto Kufi Arabic', script: 'arabic', style: 'sans', weights: [400, 700] },
  { family: 'Changa', script: 'arabic', style: 'display', weights: [400, 700] },
  { family: 'Lalezar', script: 'arabic', style: 'display', weights: [400] },
  { family: 'Rakkas', script: 'arabic', style: 'display', weights: [400] },
  { family: 'Reem Kufi', script: 'arabic', style: 'rounded', weights: [400, 700] },
  { family: 'El Messiri', script: 'arabic', style: 'serif', weights: [400, 700] },
  { family: 'Amiri', script: 'arabic', style: 'serif', weights: [400, 700] },
];
export const LATIN_BRAND_FONTS = BRAND_FONTS.filter(font => font.script === 'latin').map(font => font.family);
export const ARABIC_BRAND_FONTS = BRAND_FONTS.filter(font => font.script === 'arabic').map(font => font.family);

/** The headline fonts for one script, for the picker and the planner prompt. */
export function fontsForScript(script: 'latin' | 'arabic'): readonly BrandFont[] {
  return BRAND_FONTS.filter(font => font.script === script);
}

/** Accept only a family from the lists above, in its canonical casing. */
export function resolveBrandFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const wanted = value.trim().toLowerCase();
  for (const font of BRAND_FONTS) {
    if (font.family.toLowerCase() === wanted) return font.family;
  }
  return null;
}

/** Google Fonts stylesheet for one family, asking only for the weights it ships. */
export function brandFontStylesheetUrl(family: string): string {
  const weights = BRAND_FONTS.find(font => font.family === family)?.weights ?? [400, 700];
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weights.join(';')}&display=swap`;
}
