import { campaignSchema, canApprove, type Campaign } from '../campaign/schema';
import type { Asset } from '../db/schema';
import { getDatabase, type AdMorphDB } from '../db/dexie';
import { creativeSchema, type Creative } from './schema';
import { compose } from './composition';
import { loadCreative, saveCreative } from './repository';
export type StudioData = { creative: Creative; assets: Asset[] };
export function buildCreativeSet(campaign: Campaign, product: Asset, logo: Asset | null, existing: StudioData[]): StudioData[] {
  const valid = campaignSchema.parse(campaign);
  if (valid.planRevision !== valid.inputRevision || valid.concepts.length !== 3 || !valid.concepts.every(item => item.approved && canApprove(item)) || product.id !== valid.productAssetId || product.kind !== 'product') throw new Error('approval_required');
  return valid.concepts.map(concept => {
    const saved = existing.find(item => item.creative.campaignId === valid.id && item.creative.conceptId === concept.id);
    if (saved) return { creative: creativeSchema.parse(saved.creative), assets: saved.assets };
    const owned = { ...product, id: crypto.randomUUID() }, ownedLogo = logo ? { ...logo, id: crypto.randomUUID() } : null;
    return { creative: compose(valid, concept, owned.id, ownedLogo?.id ?? null), assets: [owned, ...(ownedLogo ? [ownedLogo] : [])] };
  });
}
export async function readCreativeSet(campaign: Campaign, db: AdMorphDB = getDatabase()): Promise<StudioData[]> {
  const rows = await Promise.all(campaign.concepts.map(concept => loadCreative(campaign.id, concept.id, db)));
  return rows.filter((row): row is StudioData => !!row);
}
export async function saveCreativeSet(entries: StudioData[], db: AdMorphDB = getDatabase()) {
  await db.transaction('rw', db.creatives, db.assets, async () => { for (const entry of entries) await saveCreative(entry.creative, entry.assets, db); });
}
