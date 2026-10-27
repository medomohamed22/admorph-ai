import { getDatabase, type AdMorphDB } from '../db/dexie';
import { creativeSchema, type Creative } from './schema';
import type { Asset } from '../db/schema';
export async function saveCreative(creative: Creative, assets: Asset[], db: AdMorphDB = getDatabase()) {
  const valid = creativeSchema.parse(creative);
  await db.transaction('rw', db.creatives, db.assets, async () => {
    for (const asset of assets) if (!await db.assets.where(':id').equals(asset.id).count()) await db.assets.put(asset);
    for (const layer of valid.layers) if (layer.assetId && !await db.assets.where(':id').equals(layer.assetId).count()) throw new Error('missing_asset');
    await db.creatives.put(valid);
  });
}
export async function loadCreative(campaignId: string, conceptId: string, db: AdMorphDB = getDatabase()) {
  const candidates = await db.creatives.where('campaignId').equals(campaignId).toArray();
  const row = candidates.find(item => item.conceptId === conceptId);
  if (!row) return null;
  const creative = creativeSchema.parse(row);
  const ids = [...new Set(creative.layers.flatMap(layer => layer.assetId ? [layer.assetId] : []))];
  const assets = (await db.assets.bulkGet(ids)).filter((item): item is Asset => !!item);
  return { creative, assets };
}
