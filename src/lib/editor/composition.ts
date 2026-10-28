import type { Campaign, EditableConcept } from '../campaign/schema';
import { type Creative, type EditableLayer } from './schema';
import { dimensionsFor } from './sizes';
import { defaultLogoPlacement, logoBox } from './logo-placement';
import { spatialLayers } from './spatial';
import { ctaBrandPair } from './brand-colors';
export function compose(campaign: Campaign, concept: EditableConcept, productId: string, logoId: string | null): Creative {
  const arabic = concept.copyLocale ? concept.copyLocale.startsWith('ar') : campaign.creativeLanguage === 'ar';
  const fontFamily = arabic ? (campaign.brandSnapshot.recommendedFontAr ?? 'Cairo') : (campaign.brandSnapshot.recommendedFontEn ?? 'Inter');
  const base = { fontFamily, fontSize: 48, visible: true, assetId: null, color: '#18251b', fill: campaign.brandSnapshot.colors[1], text: '' } as const;
  const layer = (kind: EditableLayer['kind'], x: number, y: number, width: number, height: number, patch: Partial<EditableLayer> = {}): EditableLayer => ({ ...base, id: crypto.randomUUID(), kind, x, y, width, height, ...patch });
  const ctaPair = ctaBrandPair(campaign.brandSnapshot.colors);
  // The extracted wordmark weight carries into the brand and headline
  // layers; the CTA keeps normal weight so its capsule metrics stay put.
  const wordmarkStyle = campaign.brandSnapshot.wordmarkBold ? 'bold' as const : 'normal' as const;
  const now = new Date().toISOString();
  const creative: Creative = { id: crypto.randomUUID(), campaignId: campaign.id, conceptId: concept.id, inputRevision: campaign.inputRevision,
    caption: concept.caption, source: 'composition', model: null, createdAt: now, updatedAt: now, format: campaign.format,
    layers: [layer('background', 0, 0, 1080, 1350),
      layer('brand', 75, 60, 700, 90, { text: campaign.brandSnapshot.name, fontSize: 44, fill: 'transparent', fontStyle: wordmarkStyle }),
      ...(logoId ? [layer('logo', 850, 55, 150, 120, { assetId: logoId })] : []),
      layer('headline', 75, 205, 930, 265, { text: concept.headline, fontSize: 76, fill: 'transparent', fontStyle: wordmarkStyle }),
      layer('product', 220, 510, 640, 590, { assetId: productId }),
      layer('cta', 180, 1180, 720, 100, { text: concept.ctaText ?? (campaign.creativeLanguage === 'ar' ? 'اكتشف المزيد' : 'Discover more'), fontSize: 38, color: ctaPair.color, fill: ctaPair.fill }),
    ] };
  // Apply different templates only when creating a composition; never rewrite saved layers.
  if (concept.angle === 'benefit') {
    Object.assign(creative.layers.find(item => item.kind === 'headline')!, { x: 60, y: 245, width: 450, height: 750, fontSize: 64 });
    Object.assign(creative.layers.find(item => item.kind === 'product')!, { x: 550, y: 350, width: 480, height: 720 });
  } else if (concept.angle === 'lifestyle') {
    creative.layers[0].fill = campaign.brandSnapshot.colors[2];
    Object.assign(creative.layers.find(item => item.kind === 'product')!, { x: 160, y: 190, width: 760, height: 650 });
    Object.assign(creative.layers.find(item => item.kind === 'headline')!, { x: 75, y: 890, width: 930, height: 210, fontSize: 64 });
  }
  if(concept.spatialPreset)creative.layers=spatialLayers(creative.layers,concept.spatialPreset);
  const logo=creative.layers.find(layer=>layer.kind==='logo');if(logo&&campaign.brandSnapshot.logoPlacement)Object.assign(logo,logoBox(campaign.brandSnapshot.logoPlacement??defaultLogoPlacement,campaign.brandSnapshot.logoAspectRatio??1));
  // Width is 1080 on every platform size, so the tuned 4:5 layout scales
  // vertically only: y/height by H/1350, x/width/fonts untouched. The scale
  // runs last so angle, spatial and logo geometry all scale together, and
  // the background always fills the new canvas exactly.
  const size = dimensionsFor(campaign.format), sy = size.height / 1350;
  if (sy !== 1) creative.layers = creative.layers.map(layer => {
    const height = Math.round(layer.height * sy);
    return { ...layer, y: Math.min(Math.round(layer.y * sy), size.height - height), height };
  });
  creative.layers = resolveTextOverlap(creative.layers, size);
  return creative;
}

/** Text must never cover the product: a text box intersecting the product
 * box is moved to the first free strip around the product (above, below,
 * left, right) that fits the canvas and avoids other text boxes. When no
 * strip fits, the box slides to the nearest product edge — covering the
 * product is the worse evil, so it always loses to text-text crowding.
 * Pure geometry on layer boxes; the user can still drag text anywhere
 * afterwards, so this only guards generated and template geometry. */
export function resolveTextOverlap(layers: EditableLayer[], dimensions: { width: number; height: number }): EditableLayer[] {
  const product = layers.find(item => item.kind === 'product' && item.visible);
  if (!product) return layers;
  const MARGIN = 16;
  type Box = { x: number; y: number; width: number; height: number };
  const boxOf = (l: Pick<EditableLayer, 'x' | 'y' | 'width' | 'height'>): Box => ({ x: l.x, y: l.y, width: l.width, height: l.height });
  const hits = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const inflated: Box = { x: product.x - MARGIN, y: product.y - MARGIN, width: product.width + MARGIN * 2, height: product.height + MARGIN * 2 };
  const working = layers.map(item => ({ ...item }));
  for (const layer of working) {
    if (!['brand', 'headline', 'cta'].includes(layer.kind) || !layer.visible) continue;
    if (!hits(boxOf(layer), inflated)) continue;
    const others = working.filter(item => item.id !== layer.id && item.visible && ['brand', 'headline', 'cta'].includes(item.kind));
    const candidates = [
      { x: layer.x, y: product.y - MARGIN - layer.height },
      { x: layer.x, y: product.y + product.height + MARGIN },
      { x: product.x - MARGIN - layer.width, y: layer.y },
      { x: product.x + product.width + MARGIN, y: layer.y },
    ];
    const fits = candidates.find(c => c.x >= 0 && c.y >= 0 && c.x + layer.width <= dimensions.width && c.y + layer.height <= dimensions.height
      && !hits({ ...c, width: layer.width, height: layer.height }, inflated)
      && !others.some(o => hits({ ...c, width: layer.width, height: layer.height }, boxOf(o))));
    if (fits) { layer.x = fits.x; layer.y = fits.y; continue; }
    // Fallback: slide to the nearest product edge, clamped to the canvas.
    const centerY = layer.y + layer.height / 2, centerX = layer.x + layer.width / 2;
    const productCenterY = product.y + product.height / 2, productCenterX = product.x + product.width / 2;
    if (Math.abs(centerY - productCenterY) >= Math.abs(centerX - productCenterX)) {
      layer.y = Math.max(0, Math.min(dimensions.height - layer.height, centerY < productCenterY ? product.y - MARGIN - layer.height : product.y + product.height + MARGIN));
    } else {
      layer.x = Math.max(0, Math.min(dimensions.width - layer.width, centerX < productCenterX ? product.x - MARGIN - layer.width : product.x + product.width + MARGIN));
    }
  }
  return working;
}
