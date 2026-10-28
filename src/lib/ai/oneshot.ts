import { z } from 'zod';
import { metaBase, inputImage } from './meta-contracts';
import { brandInputSchema, type BrandInput } from '../db/schema';

/** One-shot canvas coordinates: the mockup is always 1080x1350. */
export const ONESHOT_WIDTH = 1080;
export const ONESHOT_HEIGHT = 1350;

/**
 * One layout element on the mockup canvas. `text` carries the exact string
 * for text/phone elements; image elements (product/logo/icon) carry no text.
 * The client sends only this JSON to the server — blobs never travel here.
 */
export const oneshotElementSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(['product', 'logo', 'text', 'icon', 'phone']),
  x: z.number().min(0).max(ONESHOT_WIDTH),
  y: z.number().min(0).max(ONESHOT_HEIGHT),
  width: z.number().min(24).max(ONESHOT_WIDTH),
  height: z.number().min(24).max(ONESHOT_HEIGHT),
  text: z.string().max(200).optional(),
}).strict();
export type OneshotElement = z.infer<typeof oneshotElementSchema>;

export const oneshotRequestSchema = metaBase.extend({
  imageConsent: z.literal(true),
  mockup: inputImage,
  brand: brandInputSchema,
  scene: z.string().trim().min(1).max(1000),
  language: z.enum(['en', 'ar']),
  layout: z.array(oneshotElementSchema).min(1).max(12),
}).strict();

export const verifyRequestSchema = metaBase.extend({
  imageConsent: z.literal(true),
  image: inputImage,
  layout: z.array(oneshotElementSchema).min(1).max(12),
  language: z.enum(['en', 'ar']),
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
  })).max(12),
}).strict();
export type VerifyResult = z.infer<typeof verifyResultSchema>;

/** Plain-words zone of an element's center inside the 1080x1350 frame. */
export function zoneOf(element: Pick<OneshotElement, 'x' | 'y' | 'width' | 'height'>): string {
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  const vertical = cy < ONESHOT_HEIGHT / 3 ? 'top' : cy > (2 * ONESHOT_HEIGHT) / 3 ? 'bottom' : '';
  const horizontal = cx < ONESHOT_WIDTH / 3 ? 'left' : cx > (2 * ONESHOT_WIDTH) / 3 ? 'right' : '';
  const zone = [vertical, horizontal].filter(Boolean).join(' ');
  return zone || 'center';
}

/**
 * The one-shot prompt: turn the user's mockup into a finished photorealistic
 * ad while keeping every element where the user put it. The mockup image is
 * the layout authority; the words below only name what is already drawn.
 */
export function buildOneshotPrompt(brand: BrandInput, scene: string, layout: OneshotElement[], language: 'en' | 'ar'): string {
  const lines = [
    'Turn this rough mockup into a finished photorealistic advertising image at 1080x1350.',
    'Keep every element exactly where it is in the mockup. Do not move, resize, add, or remove any element.',
  ];
  for (const element of layout) {
    const zone = zoneOf(element);
    if (element.kind === 'product') lines.push(`The product stays ${zone} at its mockup size and shape.`);
    else if (element.kind === 'logo') lines.push(`The logo stays ${zone}.`);
    else if (element.kind === 'icon') lines.push(`The icon stays ${zone}.`);
    else if (element.kind === 'phone') lines.push(`The phone number "${element.text ?? ''}" stays ${zone}; every digit must be exactly as written.`);
    else lines.push(`The text "${element.text ?? ''}" stays ${zone}, rendered exactly as written, never reworded or respelled.`);
  }
  lines.push(`Background: ${scene}.`);
  lines.push(`Brand: ${brand.name}. Brand colors: ${brand.colors.join(', ')}. Echo them in the scene.`);
  if (language === 'ar') lines.push('Any text in the image is Arabic unless it is the Latin brand name.');
  lines.push('No extra text, no extra logos, no watermark, no objects cropped by the frame edges.');
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
  return Math.round((earned / possible) * 100);
}
