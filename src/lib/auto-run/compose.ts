// Auto-run hero composition: layers for one 1080x1350 ad from a brief,
// a cutout and a local background. The product layer box IS the brief's
// reserved product zone; the canvas rasterizer contain-fits the cutout
// inside it without distortion. Text layers are transparent by default;
// the CTA keeps its hex capsule. Campaign/concept ids are fresh random
// uuids: the hero is an auto-run artifact, not a campaign creative.

import { creativeSchema, type Creative } from '../editor/schema';
import type { BackgroundBrief } from '../background/brief';

export function buildAutoCopy(
  brandName: string,
  productCategory: string,
  brandDescription?: string,
): { tagline: string; caption: string } {
  const tagline = `${brandName} · ${productCategory}`;
  const caption = brandDescription?.trim()
    ? `${brandName} — ${brandDescription.trim()}`
    : `${brandName} — ${productCategory}`;
  return { tagline, caption };
}

/** CTA sits below the product zone when it fits, otherwise in the last
 *  110px of the canvas. Never overlaps the product zone. */
export function ctaRect(brief: BackgroundBrief): { x: number; y: number; width: number; height: number } {
  const bottom = brief.reservedProductRect.y + brief.reservedProductRect.height;
  return { x: 180, y: bottom <= 1180 ? 1180 : 1240, width: 720, height: 100 };
}

export interface ComposeAutoAdInput {
  brandName: string;
  brandColors: [string, string, string];
  brief: BackgroundBrief;
  cutoutAssetId: string;
  backgroundAssetId: string;
  logoAssetId?: string | null;
  tagline: string;
  caption: string;
  cta: string;
}

export function composeAutoAd(input: ComposeAutoAdInput): Creative {
  const arabic = /[\u0600-\u06FF]/.test(input.tagline + input.brandName);
  const fontFamily = arabic ? 'Cairo' : 'Inter';
  const base = {
    fontFamily,
    fontSize: 48,
    visible: true,
    assetId: null,
    color: '#18251b',
    fill: input.brandColors[1],
    text: '',
  } as const;
  const layer = (
    kind: Creative['layers'][number]['kind'],
    x: number,
    y: number,
    width: number,
    height: number,
    patch: Partial<Creative['layers'][number]> = {},
  ): Creative['layers'][number] => ({ ...base, id: crypto.randomUUID(), kind, x, y, width, height, ...patch });
  const textRect = input.brief.reservedTextRects[0];
  const fontSize = Math.max(24, Math.min(76, Math.floor(textRect.height / 3)));
  const cta = ctaRect(input.brief);
  const now = new Date().toISOString();
  const creative: Creative = {
    id: crypto.randomUUID(),
    campaignId: crypto.randomUUID(),
    conceptId: crypto.randomUUID(),
    inputRevision: 0,
    caption: input.caption,
    source: 'composition',
    model: null,
    createdAt: now,
    updatedAt: now,
    layers: [
      layer('background', 0, 0, 1080, 1350, { assetId: input.backgroundAssetId }),
      layer('brand', 90, 40, 900, 60, { text: input.brandName, fontSize: 44, fill: 'transparent' }),
      ...(input.logoAssetId
        ? [layer('logo', 850, 55, 150, 120, { assetId: input.logoAssetId })]
        : []),
      layer('headline', textRect.x, textRect.y, textRect.width, textRect.height, {
        text: input.tagline,
        fontSize,
        fill: 'transparent',
      }),
      layer('product', input.brief.reservedProductRect.x, input.brief.reservedProductRect.y,
        input.brief.reservedProductRect.width, input.brief.reservedProductRect.height, {
          assetId: input.cutoutAssetId,
        }),
      layer('cta', cta.x, cta.y, cta.width, cta.height, {
        text: input.cta,
        fontSize: 38,
        color: '#ffffff',
        fill: '#253b2b',
      }),
    ],
  };
  return creativeSchema.parse(creative);
}
