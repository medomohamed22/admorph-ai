import { getDatabase, type AdMorphDB } from '../db/dexie';
import { reviewRecordSchema, type ReviewRecord } from './schema';
import { normalizeFingerprint } from './rules';
export async function loadReview(creativeId: string, db: AdMorphDB = getDatabase()) {
  const row = await db.creativeReviews.get(creativeId); if (!row) return null;
  const valid = reviewRecordSchema.parse(row);
  return { ...valid, fingerprint: normalizeFingerprint(valid.fingerprint) };
}
export async function saveReview(record: ReviewRecord, db: AdMorphDB = getDatabase()) { await db.creativeReviews.put(reviewRecordSchema.parse(record)); }
