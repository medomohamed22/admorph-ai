import type { Campaign, EditableConcept } from '../campaign/schema';
import { type Creative, type EditableLayer } from './schema';
import {defaultLogoPlacement,logoBox} from './logo-placement';
import {spatialLayers} from './spatial';
export function compose(campaign: Campaign, concept: EditableConcept, productId: string, logoId: string | null): Creative {
  const fontFamily = (concept.copyLocale?concept.copyLocale.startsWith('ar'):campaign.creativeLanguage==='ar') ? 'Cairo' : 'Inter';
  const base = { fontFamily, fontSize: 48, visible: true, assetId: null, color: '#18251b', fill: campaign.brandSnapshot.colors[1], text: '' } as const;
  const layer = (kind: EditableLayer['kind'], x: number, y: number, width: number, height: number, patch: Partial<EditableLayer> = {}): EditableLayer => ({ ...base, id: crypto.randomUUID(), kind, x, y, width, height, ...patch });
  const now = new Date().toISOString();
  const creative: Creative = { id: crypto.randomUUID(), campaignId: campaign.id, conceptId: concept.id, inputRevision: campaign.inputRevision,
    caption: concept.caption, source: 'composition', model: null, createdAt: now, updatedAt: now,
    layers: [layer('background', 0, 0, 1080, 1350),
      layer('brand', 75, 60, 700, 90, { text: campaign.brandSnapshot.name, fontSize: 44, fill: '#ffffff' }),
      ...(logoId ? [layer('logo', 850, 55, 150, 120, { assetId: logoId })] : []),
      layer('headline', 75, 205, 930, 265, { text: concept.headline, fontSize: 76, fill: '#ffffff' }),
      layer('product', 220, 510, 640, 590, { assetId: productId }),
      layer('cta', 180, 1180, 720, 100, { text: concept.ctaText ?? (campaign.creativeLanguage === 'ar' ? 'اكتشف المزيد' : 'Discover more'), fontSize: 38, color: '#ffffff', fill: '#253b2b' }),
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
  return creative;
}
