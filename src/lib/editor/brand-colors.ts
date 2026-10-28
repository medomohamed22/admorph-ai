// Brand-palette helpers: every CTA and brand-tinted surface must come
// from the brand's own colors, never a hardcoded accent. Luminance picks
// are pure functions over validated 6-digit hex colors.
import { luminanceOfHex, contrastFromLuminance, TEXT_CONTRAST_MIN } from '../critic/pixels';

export function darkestBrandColor(colors: readonly string[]): string {
  return colors.reduce((best, color) => luminanceOfHex(color) < luminanceOfHex(best) ? color : best);
}

export function lightestBrandColor(colors: readonly string[]): string {
  return colors.reduce((best, color) => luminanceOfHex(color) > luminanceOfHex(best) ? color : best);
}

/** CTA pair: darkest brand color as the button, lightest brand color as
 * the text when it reads well on it, otherwise black or white — whichever
 * contrasts better with the button. A degenerate single-color palette
 * keeps the previous dark-green/white default instead of invisible text. */
export function ctaBrandPair(colors: readonly string[]): { fill: string; color: string } {
  const fill = darkestBrandColor(colors);
  const lightest = lightestBrandColor(colors);
  if (fill.toLowerCase() === lightest.toLowerCase()) return { fill: '#253b2b', color: '#ffffff' };
  if (contrastFromLuminance(luminanceOfHex(lightest), luminanceOfHex(fill)) >= TEXT_CONTRAST_MIN) return { fill, color: lightest };
  const black = contrastFromLuminance(luminanceOfHex('#000000'), luminanceOfHex(fill));
  const white = contrastFromLuminance(luminanceOfHex('#ffffff'), luminanceOfHex(fill));
  return { fill, color: black >= white ? '#000000' : '#ffffff' };
}
