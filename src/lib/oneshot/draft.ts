import { getDatabase, type AdMorphDB } from '../db/dexie';
import type { BrandInput } from '../db/schema';
import type { OneshotCanvasElement } from '../ai/oneshot';
import type { PlanDialect } from '../campaign/dialects';
import type { ArtBrief } from '../ai/art-brief';

/**
 * The one-shot wizard's progress, kept in IndexedDB so a reload, a trip to
 * the brand page, or a closed tab never loses the work. Blobs (product,
 * cutout, logo, icons) are stored as Blobs, never as base64 in localStorage.
 */
export type OneshotDraft = {
  version: 1;
  step: number;
  originalBlob: Blob | null;
  currentBlob: Blob | null;
  cutoutBlob: Blob | null;
  logoBlob: Blob | null;
  enhance: boolean;
  brand: BrandInput;
  selectedBrandId: string;
  headlineFont: string | null;
  brief: string;
  scene: string;
  concepts: { angle: string; title: string; headline: string; caption: string; visualDirection: string; artBrief?: ArtBrief }[];
  selectedConcept: number | null;
  suggestedFonts: string[];
  elements: OneshotCanvasElement[];
  dialect?: PlanDialect;
  savedAt: string;
};

const KEY = 'oneshotDraft';

function isDraft(value: unknown): value is OneshotDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<OneshotDraft>;
  return draft.version === 1 && typeof draft.step === 'number' && Array.isArray(draft.elements) && !!draft.brand && Array.isArray(draft.brand.colors);
}

export async function loadDraft(db: AdMorphDB = getDatabase()): Promise<OneshotDraft | null> {
  const record = await db.settings.get(KEY);
  return isDraft(record?.value) ? record.value : null;
}

export async function saveDraft(draft: OneshotDraft, db: AdMorphDB = getDatabase()) {
  await db.settings.put({ key: KEY, value: draft });
}

export async function clearDraft(db: AdMorphDB = getDatabase()) {
  await db.settings.delete(KEY);
}

/** A draft is worth restoring only when it carries a product. */
export function draftHasWork(draft: OneshotDraft | null): draft is OneshotDraft {
  return !!draft && !!draft.originalBlob;
}
