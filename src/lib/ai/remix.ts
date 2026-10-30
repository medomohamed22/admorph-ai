import { z } from 'zod';
import { metaBase, inputImage } from './meta-contracts';
import { brandInputSchema } from '../db/schema';

/**
 * Seasonal themes. Each card names a palette, the cues that MUST be visible
 * and the light, so a Ramadan copy cannot come back looking like the
 * original. Prompt text is English; display names live in the messages.
 */
export const REMIX_THEMES = [
  { id: 'ramadan', palette: 'deep emerald green, warm gold and night navy', cues: ['glowing Ramadan lanterns (fanous)', 'a crescent moon', 'Islamic geometric patterns', 'dates on a small brass plate'], light: 'warm evening glow with lantern light' },
  { id: 'eid', palette: 'soft white, gold and festive rose pink', cues: ['Eid cookies (kahk) dusted with sugar', 'wrapped gift boxes with ribbons', 'hanging star garlands', 'a few festive balloons'], light: 'bright, celebratory morning light' },
  { id: 'black-friday', palette: 'matte black with neon red accents', cues: ['a bold sale tag shape (no words on it)', 'diagonal tape stripes', 'sharp geometric shapes', 'dramatic spotlight beams'], light: 'hard, high-contrast studio light' },
  { id: 'summer', palette: 'turquoise, sunny yellow and sand', cues: ['fine beach sand', 'clear water with ripples', 'palm leaf shadows', 'sunglasses or a beach towel'], light: 'strong midday sun with crisp shadows' },
] as const;
export type RemixThemeId = (typeof REMIX_THEMES)[number]['id'];
const themeIds = REMIX_THEMES.map(theme => theme.id) as [RemixThemeId, ...RemixThemeId[]];

/** Remix input. `source: 'product'` means the image is the product cutout
 *  (a brand-new design); `'ad'` means a finished ad (older saved ads). */
export const remixRequestSchema = metaBase.extend({
  imageConsent: z.literal(true),
  image: inputImage,
  brand: brandInputSchema,
  scene: z.string().trim().min(1).max(1000),
  headline: z.string().trim().min(1).max(200),
  language: z.enum(['en', 'ar']),
  source: z.enum(['ad', 'product']).optional(),
  theme: z.enum(themeIds).optional(),
}).strict();

export function buildRemixPrompt(brand: { name: string; colors: [string, string, string] }, scene: string, headline: string, language: 'en' | 'ar', source: 'ad' | 'product' = 'ad', themeId?: RemixThemeId): string {
  const theme = themeId ? REMIX_THEMES.find(item => item.id === themeId) : undefined;
  const lines = source === 'product'
    ? ['This image is a product photo. Design a brand-new photorealistic advertisement at 4:5 around this exact product.',
      'Keep the product identical: same shape, colors, packaging, label and every printed word on it. Do not redraw or restyle the product.',
      'Use a fresh composition, camera angle and setting; do not copy any earlier ad.']
    : ['This is a finished advertisement. Redesign it as a clearly different ad: new background, new composition, new lighting.',
      'Keep the exact same product: same shape, colors, packaging and every printed word on it.'];
  lines.push(`Scene: ${scene}.`);
  if (theme) {
    lines.push(`Season: ${theme.id}. Palette: ${theme.palette}. Light: ${theme.light}.`);
    lines.push(`At least three of these must be clearly visible around the product: ${theme.cues.join('; ')}.`);
  }
  lines.push(`Brand colors: ${brand.colors.join(', ')}. The brand's name is context only: never write it as text.`);
  lines.push(`The only words allowed in the image are "${headline}" (rendered exactly as written, in one clear headline) plus text already printed on the product itself. Write no other word, slogan, tag text or watermark.`);
  if (language === 'ar') lines.push('Arabic text reads right to left with correctly joined letters.');
  lines.push('No objects cropped by the frame edges.');
  return lines.join(' ');
}

/** A seasonal copy must show at least two of its cues to pass review. */
export const MIN_SEASON_CUES = 2;
