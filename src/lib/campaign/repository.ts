import { getDatabase, type AdMorphDB } from '../db/dexie';
import { campaignSchema, type Campaign } from './schema';
import type { Asset } from '../db/schema';

export async function loadCampaigns(db: AdMorphDB = getDatabase()) {
  const [rows, assets, setting] = await Promise.all([db.campaigns.toArray(), db.assets.where('kind').equals('product').toArray(), db.settings.get('activeCampaignId')]);
  const campaigns = rows.flatMap(row => { const value = campaignSchema.safeParse(row); return value.success ? [value.data] : []; });
  return { campaigns, assets, activeId: typeof setting?.value === 'string' ? setting.value : null };
}
export async function saveCampaign(campaign: Campaign, asset: Asset | null, db: AdMorphDB = getDatabase()) {
  const valid = campaignSchema.parse(campaign);
  await db.transaction('rw', db.campaigns, db.assets, db.settings, async () => {
    const previous = await db.campaigns.get(valid.id);
    if (asset) {
      if (asset.id !== valid.productAssetId || asset.kind !== 'product') throw new Error('asset_mismatch');
      await db.assets.put(asset);
    }
    await db.campaigns.put(valid);
    await db.settings.put({ key: 'activeCampaignId', value: valid.id });
    if (previous?.productAssetId && previous.productAssetId !== valid.productAssetId) await db.assets.delete(previous.productAssetId);
  });
}
