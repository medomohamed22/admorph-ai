import { z } from 'zod';
import { metaBase, inputImage } from './meta-contracts';
import { brandInputSchema } from '../db/schema';
import { qualityRules, MARK_CONTRAST_RULE } from './quality';
import { logoPositions, zoneWords, zoneOf, logoBox, type LogoPosition } from '../editor/logo-placement';
import { ONESHOT_WIDTH, type OneshotElement } from './oneshot';

/** How many of an ad's small icons travel to its copies (each is one more image in the request). */
export const MAX_COPY_ICONS = 2;

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
  /** The reviewer's notes on a failed first copy; present only on the one repair. */
  fixNotes: z.array(z.string().trim().min(1).max(300)).min(1).max(8).optional(),
  /** The brand logo of the source ad, sent as a second image so the copy keeps it. */
  logo: inputImage.optional(),
  /** Where the logo sat on the source ad; the copy puts it in the same place. */
  logoPosition: z.enum(logoPositions).optional(),
  /** The source ad's small icons, each with the place it sat, sent as more images after the logo. */
  icons: z.array(z.object({ image: inputImage, position: z.enum(logoPositions) }).strict()).min(1).max(MAX_COPY_ICONS).optional(),
}).strict();

/** The logo and icons that go along with a remix. `logo: true` means a logo
 *  with no saved place (older ads): it goes in the reading-side top corner. */
export type RemixMarks = { logo?: LogoPosition | true; icons?: LogoPosition[] };


/** The order of the images the painter receives: the product or ad first, then the logo, then each icon. */
export function remixImageNotes(marks: RemixMarks, language: 'en' | 'ar'): string[] {
  const lines: string[] = [];
  let index = 2;
  if (marks.logo) {
    const place = marks.logo === true ? `top ${language === 'ar' ? 'left' : 'right'} corner` : zoneWords(marks.logo);
    lines.push(`Image ${index} is the brand's logo. Place it small and clearly visible at the ${place} of the frame, exactly where the original ad had it, on a calm area, copied exactly as drawn: same shape, letters and colors, never redrawn, restyled or recolored. The logo's own letters are allowed. ${MARK_CONTRAST_RULE}`);
    index++;
  }
  const icons = marks.icons ?? [];
  if (icons.length) {
    const places = icons.map((position, offset) => `image ${index + offset} at the ${zoneWords(position)}`).join(', ');
    lines.push(`${icons.length === 1 ? `Image ${index} is a small brand icon` : `Images ${index} to ${index + icons.length - 1} are small brand icons`}. Place each one small, exactly where the original ad had it: ${places} of the frame (side by side when two share a place), copied exactly as drawn with the same shapes and colors, never redrawn or restyled, clear of the product and the headline. Letters inside an icon belong to it and are allowed. ${MARK_CONTRAST_RULE}`);
  }
  return lines;
}

export function buildRemixPrompt(brand: { name: string; colors: [string, string, string] }, scene: string, headline: string, language: 'en' | 'ar', source: 'ad' | 'product' = 'ad', themeId?: RemixThemeId, fixNotes: string[] = [], marks: RemixMarks | boolean = {}): string {
  const sent: RemixMarks = typeof marks === 'boolean' ? (marks ? { logo: true } : {}) : marks;
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
  // The source ad's logo and icons ride along as more images, so a seasonal copy or variant keeps them in their places.
  lines.push(...remixImageNotes(sent, language));
  lines.push(`The only words allowed in the image are "${headline}" (rendered exactly as written, in one clear headline) plus text already printed on the product itself and the letters of the logo and icons given as images. Write no other word, slogan, tag text or watermark.`);
  if (language === 'ar') lines.push('Arabic text reads right to left with correctly joined letters.');
  lines.push('No objects cropped by the frame edges.');
  lines.push(qualityRules(true));
  if (fixNotes.length) lines.push(`A previous attempt failed review. Fix exactly these problems: ${fixNotes.map((note, index) => `(${index + 1}) ${note}`).join(' ')}`);
  return lines.join(' ');
}

/** A seasonal copy must show at least two of its cues to pass review. */
export const MIN_SEASON_CUES = 2;

/**
 * When Meta refuses a planner or painter request for a seasonal copy (it
 * happens for some ad and season pairs, e.g. a music ad for Ramadan), the
 * copy is still made from these: a plain seasonal greeting and a scene built
 * only from the season's own palette and props.
 */
export const SEASON_FALLBACK_HEADLINE: Record<RemixThemeId, { en: string; ar: string }> = {
  ramadan: { en: 'Ramadan Kareem', ar: 'رمضان كريم' },
  eid: { en: 'Happy Eid', ar: 'عيد سعيد' },
  'black-friday': { en: 'Black Friday deals', ar: 'عروض الجمعة البيضاء' },
  summer: { en: 'Fresh this summer', ar: 'انتعش هذا الصيف' },
};
export function seasonFallbackScene(themeId: RemixThemeId): string {
  const theme = REMIX_THEMES.find(item => item.id === themeId)!;
  return `The product on a simple table, surrounded by ${theme.cues.slice(0, 3).join(', ')}. ${theme.light}. Palette: ${theme.palette}.`;
}
/** Plain scenes for variants when the planner refuses; one per variant axis. */
export const NEUTRAL_VARIANT_SCENES = [
  'A bright minimal studio set with a pale stone surface and soft daylight from the left',
  'A warm wooden table by a window at golden hour, with a linen cloth and long soft shadows',
  'A cool modern countertop in soft blue evening light with a few glass and metal accents',
] as const;
/** Refusals and malformed answers that a plain fallback request can get past. */
export const FALLBACK_CODES = ['plan_blocked', 'plan_invalid', 'plan_truncated', 'invalid_response'] as const;

/** Remix frames are 4:5. */
const REMIX_HEIGHT = 1350;

/**
 * The layout a remix is reviewed against: product and headline anywhere,
 * the logo and icons in the places the source ad had them.
 */
export function remixReviewLayout(headline: string, marks: RemixMarks, language: 'en' | 'ar'): OneshotElement[] {
  const box = (position: LogoPosition, widthPercent: number, aspect: number) => { const { x, y, width, height } = logoBox({ enabled: true, position, widthPercent, marginPercent: 5, opacity: 1 }, aspect, ONESHOT_WIDTH, REMIX_HEIGHT); return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }; };
  const logoPlace: LogoPosition | undefined = marks.logo === true ? (language === 'ar' ? 'top-left' : 'top-right') : marks.logo;
  return [
    { id: 'product', kind: 'product', x: 340, y: 400, width: 400, height: 550 },
    ...(logoPlace ? [{ id: 'logo', kind: 'logo' as const, ...box(logoPlace, 18, 2.5) }] : []),
    ...(marks.icons ?? []).map((position, index) => ({ id: `icon-${index + 1}`, kind: 'icon' as const, ...box(position, 10, 1) })),
    { id: 'headline', kind: 'text', x: 90, y: 90, width: 900, height: 120, text: headline },
  ];
}

/** The reviewer's logo and icon checks for a freely composed copy: in their places and readable. */
export function freeMarksLine(layout: OneshotElement[]): string {
  const logo = layout.find(element => element.kind === 'logo');
  const icons = layout.filter(element => element.kind === 'icon');
  const where = (element: OneshotElement) => zoneWords(zoneOf(element, ONESHOT_WIDTH, REMIX_HEIGHT));
  const logoLine = logo
    ? `Logo: logoKept is true only when the brand logo is clearly visible near the ${where(logo)} of the ad, unchanged, and easy to read against what is directly behind it; it is false when the logo is missing, redrawn, in another part of the frame, or blends into its background (a dark logo on a dark area, a light one on a light area), and logoNote says which.`
    : 'Logo: logoKept is true when no logo was expected.';
  return icons.length ? `${logoLine} Icons: the ad should also show ${icons.length === 1 ? 'a small brand icon' : `${icons.length} small brand icons`} near the ${icons.map(where).join(' and the ')}; their own letters are not extra text, and a missing icon is named in layoutNote.` : logoLine;
}
