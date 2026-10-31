import { z } from 'zod';
import { metaBase, inputImage } from './meta-contracts';
import { brandInputSchema, type BrandInput } from '../db/schema';
import { qualityRules } from './quality';

/** One-shot canvas coordinates: always 1080 wide; the height follows the size picked before generating. */
export const ONESHOT_WIDTH = 1080;
export const ONESHOT_HEIGHT = 1350;
export const ONESHOT_FORMATS = ['1080x1350', '1080x1080', '1080x1920'] as const;
export type OneshotFormat = (typeof ONESHOT_FORMATS)[number];
const MAX_FRAME_HEIGHT = 1920;
/** The frame height of a size; anything unknown is the 4:5 feed size. */
export function frameHeightOf(format: OneshotFormat | undefined | null): number {
  return format === '1080x1080' ? 1080 : format === '1080x1920' ? 1920 : ONESHOT_HEIGHT;
}
const FORMAT_WORDS: Record<OneshotFormat, string> = { '1080x1350': '4:5 portrait feed post', '1080x1080': '1:1 square post', '1080x1920': '9:16 full-screen story' };

/**
 * One layout element on the mockup canvas. `text` carries the exact string
 * for text/phone elements; image elements (product/logo/icon) carry no text.
 * The client sends only this JSON to the server — blobs never travel here.
 */
export const oneshotElementSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(['product', 'logo', 'text', 'icon', 'phone']),
  x: z.number().min(0).max(ONESHOT_WIDTH),
  y: z.number().min(0).max(MAX_FRAME_HEIGHT),
  width: z.number().min(24).max(ONESHOT_WIDTH),
  height: z.number().min(24).max(MAX_FRAME_HEIGHT),
  text: z.string().max(200).optional(),
  /** A text drawn on a solid shape: a price tag, a discount sticker or a button. */
  badge: z.enum(['price', 'discount', 'cta']).optional(),
}).strict();
export type OneshotElement = z.infer<typeof oneshotElementSchema>;

export const oneshotRequestSchema = metaBase.extend({
  imageConsent: z.literal(true),
  mockup: inputImage,
  brand: brandInputSchema,
  scene: z.string().trim().min(1).max(1000),
  language: z.enum(['en', 'ar']),
  layout: z.array(oneshotElementSchema).min(1).max(20),
  /** The critic's notes on a failed first attempt; present only on the one repair retry. */
  fixNotes: z.array(z.string().trim().min(1).max(300)).min(1).max(8).optional(),
  /** The size picked before generating; absent means 4:5. */
  format: z.enum(ONESHOT_FORMATS).optional(),
  /** A sharp close-up of the product, so its label text survives the small size it has on the mockup. */
  product: inputImage.optional(),
}).strict().superRefine((value, ctx) => {
  const height = frameHeightOf(value.format);
  if (value.layout.some(element => element.y + element.height > height + 0.5)) ctx.addIssue({ code: 'custom', path: ['layout'], message: 'element outside the frame' });
});

export const verifyRequestSchema = metaBase.extend({
  imageConsent: z.literal(true),
  image: inputImage,
  layout: z.array(oneshotElementSchema).min(1).max(20),
  language: z.enum(['en', 'ar']),
  /** A seasonal remix asks the critic to name the season cues it can see. */
  season: z.enum(['ramadan', 'eid', 'black-friday', 'summer']).optional(),
}).strict();

export const verifyResultSchema = z.object({
  productKept: z.boolean(),
  productNote: z.string().max(300),
  logoKept: z.boolean(),
  logoNote: z.string().max(300),
  layoutKept: z.boolean(),
  layoutNote: z.string().max(300),
  texts: z.array(z.object({
    id: z.string().max(80),
    expected: z.string().max(200),
    found: z.string().max(200),
    match: z.boolean(),
  })).max(20),
  /** Words painted in the ad that the mockup never had (not counting text printed on the product itself). */
  extraText: z.array(z.string().max(120)).max(8).optional(),
  /** Seasonal elements the critic can see, when a season was asked for. */
  seasonCues: z.array(z.string().max(80)).max(10).optional(),
  /** Publish-ready checks: every word contrasts with what is behind it, and no word, price or button touches the product. */
  textReadable: z.boolean().optional(),
  textClearOfProduct: z.boolean().optional(),
  /** False when the picture keeps flat bands, borders, letterbox bars or a frame instead of one full scene. */
  cleanFrame: z.boolean().optional(),
  qualityNote: z.string().max(300).optional(),
}).strict();
export type VerifyResult = z.infer<typeof verifyResultSchema>;

/** Plain-words zone of an element's center inside the frame. */
export function zoneOf(element: Pick<OneshotElement, 'x' | 'y' | 'width' | 'height'>, frameHeight = ONESHOT_HEIGHT): string {
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  const vertical = cy < frameHeight / 3 ? 'top' : cy > (2 * frameHeight) / 3 ? 'bottom' : '';
  const horizontal = cx < ONESHOT_WIDTH / 3 ? 'left' : cx > (2 * ONESHOT_WIDTH) / 3 ? 'right' : '';
  const zone = [vertical, horizontal].filter(Boolean).join(' ');
  return zone || 'center';
}

const BADGE_SHAPE = { price: 'rounded price tag', discount: 'round discount sticker', cta: 'rounded call-to-action button' } as const;

/**
 * The one-shot prompt: turn the user's mockup into a finished photorealistic
 * ad while keeping every element where the user put it. The mockup image is
 * the layout authority; the words below only name what is already drawn.
 */
/**
 * Sent with the second image: a sharp close-up of the product cut from the
 * full-resolution photo. The mockup shows the product small, so its label is
 * only legible here; the painter copies the product's details from it.
 */
export const PRODUCT_REFERENCE_RULE = 'The second image is a sharp close-up of the exact same product. Use it as the only source for the product\'s details: copy its shape, proportions, colors, materials, logo and every printed word, letter and number on its label exactly as they appear there, sharp and legible, never guessed, blurred, respelled or invented. Place the product where the mockup shows it, at the mockup size.';

export function buildOneshotPrompt(brand: BrandInput, scene: string, layout: OneshotElement[], language: 'en' | 'ar', fixNotes: string[] = [], format: OneshotFormat = '1080x1350', withProductReference = false): string {
  const frameHeight = frameHeightOf(format);
  const lines = [
    `Turn this rough mockup into a finished photorealistic advertising image at 1080x${frameHeight}, a ${FORMAT_WORDS[format]}. Keep exactly this shape and fill the whole frame edge to edge; no borders or empty bands.`,
    'Keep every element exactly where it is in the mockup. Do not move, resize, add, or remove any element.',
  ];
  for (const element of layout) {
    const zone = zoneOf(element, frameHeight);
    if (element.kind === 'product') lines.push(`The product stays ${zone} at its mockup size and shape.`);
    else if (element.kind === 'logo') lines.push(`The logo stays ${zone}.`);
    else if (element.kind === 'icon') lines.push(`The icon stays ${zone}.`);
    else if (element.kind === 'phone') lines.push(`The phone number "${element.text ?? ''}" stays ${zone}; every digit must be exactly as written.`);
    else if (element.badge) lines.push(`The text "${element.text ?? ''}" sits on a solid ${BADGE_SHAPE[element.badge]} ${zone}, in the badge colors of the mockup, rendered exactly as written.`);
    else lines.push(`The text "${element.text ?? ''}" stays ${zone}, rendered exactly as written, never reworded or respelled.`);
  }
  if (withProductReference) lines.push(PRODUCT_REFERENCE_RULE);
  lines.push(`Scene: ${scene}.`);
  lines.push('Paint a real, specific place with depth and props, never a plain studio backdrop or empty void. Light the product to match the scene, with natural contact shadows and reflections, so it sits in the scene rather than floating on it.');
  lines.push(`Brand colors: ${brand.colors.join(', ')}. Echo them in the scene. The brand's name is context only: never write it as text.`);
  const allowed = layout.filter(element => (element.kind === 'text' || element.kind === 'phone') && element.text?.trim()).map(element => `"${element.text!.trim()}"`);
  lines.push(allowed.length
    ? `The only words allowed anywhere in the image are ${allowed.join(', ')}, plus text already printed on the product itself. Write no other word, name, slogan or label.`
    : 'Write no words at all, except text already printed on the product itself.');
  if (language === 'ar') lines.push('Arabic text reads right to left with correctly joined letters.');
  lines.push('No extra logos, no watermark, no objects cropped by the frame edges.');
  lines.push(qualityRules(allowed.length > 0));
  if (fixNotes.length) lines.push(`A previous attempt failed review. Fix exactly these problems: ${fixNotes.map((note, index) => `(${index + 1}) ${note}`).join(' ')}`);
  return lines.join(' ');
}

/**
 * Fidelity score for the certificate: product 40, layout 20, logo 15 (only
 * when a logo was expected), texts share 25 (full marks when there are none
 * to check). Pure so the UI and the tests agree.
 */
export function oneshotScore(result: VerifyResult, logoExpected: boolean): number {
  const textTotal = result.texts.length === 0 ? 25 : 25 * (result.texts.filter(item => item.match).length / result.texts.length);
  const earned = (result.productKept ? 40 : 0) + (result.layoutKept ? 20 : 0) + (logoExpected && result.logoKept ? 15 : 0) + textTotal;
  const possible = 40 + 20 + (logoExpected ? 15 : 0) + 25;
  // Painted words the mockup never had cost 10 each (at most 30), so an ad
  // that invents a slogan falls under the repair threshold.
  const extraPenalty = Math.min(30, 10 * (result.extraText?.length ?? 0));
  // Words that cannot be read, or that sit on the product, make an ad unpublishable: 15 each.
  const qualityPenalty = (result.textReadable === false ? 15 : 0) + (result.textClearOfProduct === false ? 15 : 0) + (result.cleanFrame === false ? 15 : 0);
  return Math.max(0, Math.round((earned / possible) * 100) - extraPenalty - qualityPenalty);
}

/** Canvas-side element: the server layout plus the local render payload. */
export type OneshotCanvasElement = OneshotElement & {
  blob?: Blob;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Badge background color. */
  fill?: string;
};

/** Keep a dragged/resized element inside the frame (min 24px a side). */
export function clampOneshotElement<T extends OneshotElement>(element: T, frameHeight = ONESHOT_HEIGHT): T {
  const width = Math.min(Math.max(24, element.width), ONESHOT_WIDTH);
  const height = Math.min(Math.max(24, element.height), frameHeight);
  return {
    ...element,
    width,
    height,
    x: Math.min(Math.max(0, element.x), ONESHOT_WIDTH - width),
    y: Math.min(Math.max(0, element.y), frameHeight - height),
  };
}

/** Strip canvas-only fields before sending a layout to the server. */
export function toServerLayout(elements: OneshotCanvasElement[]): OneshotElement[] {
  return elements.map((element) => {
    const layout = { ...element };
    delete layout.blob;
    delete layout.color;
    delete layout.fontSize;
    delete layout.fontFamily;
    delete layout.bold;
    delete layout.align;
    delete layout.fill;
    return layout;
  });
}

/**
 * Scale an element around its center by a factor, keeping its aspect and
 * staying inside the frame (never below the 24px minimum, never past an
 * edge). Canvas-only fields (blob, color, font) survive untouched.
 */
export function scaleOneshotElement<T extends OneshotElement>(element: T, factor: number, frameHeight = ONESHOT_HEIGHT): T {
  const fit = Math.min(factor, ONESHOT_WIDTH / element.width, frameHeight / element.height);
  const safe = Math.max(fit, 24 / element.width, 24 / element.height);
  const width = element.width * safe, height = element.height * safe;
  const x = Math.min(Math.max(0, element.x + (element.width - width) / 2), ONESHOT_WIDTH - width);
  const y = Math.min(Math.max(0, element.y + (element.height - height) / 2), frameHeight - height);
  return { ...element, width, height, x, y };
}

/** Starter arrangement: product centered, logo top-right, headline top-center. */
/**
 * The product's box on a fresh mockup, shaped like the cropped product and as
 * large as the space under the headline allows, so the product keeps as many
 * of its own pixels as possible on the mockup.
 */
export function productBoxFor(aspect: number, frameHeight = ONESHOT_HEIGHT): { x: number; y: number; width: number; height: number } {
  const top = 300, bottomMargin = 110;
  const maxWidth = 760, maxHeight = Math.max(300, Math.min(860, frameHeight - top - bottomMargin));
  const ratio = Number.isFinite(aspect) && aspect > 0 ? Math.min(5, Math.max(0.2, aspect)) : 2 / 3;
  let width = maxWidth, height = Math.round(maxWidth / ratio);
  if (height > maxHeight) { height = maxHeight; width = Math.round(maxHeight * ratio); }
  return { x: Math.round((ONESHOT_WIDTH - width) / 2), y: top + Math.round((maxHeight - height) / 2), width, height };
}

export function initialOneshotLayout(hasLogo: boolean, productAspect?: number, frameHeight = ONESHOT_HEIGHT): OneshotElement[] {
  const layout: OneshotElement[] = [
    { id: 'product', kind: 'product', ...(productAspect ? productBoxFor(productAspect, frameHeight) : { x: 340, y: 380, width: 400, height: 600 }) },
    { id: 'headline', kind: 'text', x: 140, y: 120, width: 800, height: 120, text: '' },
  ];
  if (hasLogo) layout.push({ id: 'logo', kind: 'logo', x: 830, y: 40, width: 200, height: 80 });
  return layout;
}

/**
 * Move an arranged mockup to another size before painting: every element
 * keeps its vertical position as a share of the frame, and anything taller
 * than the new frame allows is scaled down around its center (keeping its
 * shape, so the product is never squashed).
 */
export function reflowLayout<T extends OneshotElement>(elements: T[], fromHeight: number, toHeight: number): T[] {
  if (fromHeight === toHeight) return elements;
  return elements.map(element => {
    const limit = toHeight * (element.kind === 'product' ? 0.72 : 0.9);
    const shrink = element.height > limit ? limit / element.height : 1;
    const width = element.width * shrink, height = element.height * shrink;
    const centerY = (element.y + element.height / 2) * (toHeight / fromHeight);
    const x = element.x + (element.width - width) / 2;
    return clampOneshotElement({ ...element, x, y: centerY - height / 2, width, height }, toHeight);
  });
}
