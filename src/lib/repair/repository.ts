import { getDatabase, type AdMorphDB } from '../db/dexie';
import { saveCreative } from '../editor/repository';
import type { Asset } from '../db/schema';
import type { RepairReceipt } from './schema';
import { validateReceipt } from './engine';
export async function persistRepair(record: RepairReceipt, assets: Asset[], db: AdMorphDB = getDatabase()) {
  const valid = validateReceipt(record);
  await db.transaction('rw', db.creatives, db.assets, db.repairHistory, async () => {
    await saveCreative(valid.after, assets, db);
    await db.repairHistory.put(valid);
  });
}
export async function loadLatestRepair(creativeId: string, db: AdMorphDB = getDatabase()) {
  const rows = await db.repairHistory.where('creativeId').equals(creativeId).sortBy('appliedAt');
  const last = rows.at(-1); return last ? validateReceipt(last) : null;
}
