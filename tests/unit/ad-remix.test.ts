import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { saveAd, loadSavedAds, deleteSavedAd } from '../../src/lib/db/repository';
import { remixRequestSchema, buildRemixPrompt, REMIX_THEMES } from '../../src/lib/ai/remix';
import type { SavedAd } from '../../src/lib/db/schema';

const databases: AdMorphDB[] = [];
function database() { const db = new AdMorphDB(`test-admorph-${crypto.randomUUID()}`); databases.push(db); return db; }
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); });

const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aexkAAAAASUVORK5CYII='), char => char.charCodeAt(0))], { type: 'image/png' });
const BRAND = { name: 'NOUR', description: 'Cold brew coffee', colors: ['#16100C', '#F5EEDF', '#7ED3E0'] as [string, string, string] };
const IMAGE = { mimeType: 'image/png' as const, data: 'iVBORw0KGgo=' };
const BASE = { providerId: 'meta' as const, apiKey: 'k', modelId: 'muse-image-1.0', consent: true as const, imageConsent: true as const };

function ad(partial: Partial<SavedAd>): SavedAd {
  return { id: crypto.randomUUID(), blob: png, source: 'oneshot', brand: BRAND, headline: 'Fresh taste', hasLogo: true, createdAt: new Date().toISOString(), ...partial };
}

describe('ad remix prompt', () => {
  it('keeps the product, swaps scene and headline, and never writes the brand name', () => {
    const prompt = buildRemixPrompt(BRAND, 'Ramadan lantern light', 'Ramadan nights taste better', 'ar');
    expect(prompt).toContain('Ramadan nights taste better');
    expect(prompt).toContain('Ramadan lantern light');
    expect(prompt).not.toContain('NOUR');
    expect(prompt).toContain('never write it as text');
    expect(prompt).toContain('same product');
    expect(prompt).toContain('Arabic');
  });
  it('a seasonal redesign from the product names its palette and at least three required cues', () => {
    const prompt = buildRemixPrompt(BRAND, 'a festive table', 'Ramadan Kareem', 'ar', 'product', 'ramadan');
    expect(prompt).toContain('product photo');
    expect(prompt).toContain('fresh composition');
    expect(prompt).toContain('emerald green');
    expect(prompt).toContain('At least three of these must be clearly visible');
    expect(prompt).toContain('lantern');
    expect(remixRequestSchema.safeParse({ ...BASE, image: IMAGE, brand: BRAND, scene: 'x', headline: 'y', language: 'ar', source: 'product', theme: 'ramadan' }).success).toBe(true);
    expect(remixRequestSchema.safeParse({ ...BASE, image: IMAGE, brand: BRAND, scene: 'x', headline: 'y', language: 'ar', theme: 'diwali' }).success).toBe(false);
  });
  it('omits the Arabic note for English ads', () => {
    expect(buildRemixPrompt(BRAND, 'beach', 'Summer fresh', 'en')).not.toContain('Arabic');
  });
  it('validates the remix request', () => {
    expect(remixRequestSchema.safeParse({ ...BASE, image: IMAGE, brand: BRAND, scene: 'beach', headline: 'Fresh', language: 'en' }).success).toBe(true);
    expect(remixRequestSchema.safeParse({ ...BASE, image: IMAGE, brand: BRAND, scene: 'beach', headline: '', language: 'en' }).success).toBe(false);
    expect(remixRequestSchema.safeParse({ ...BASE, brand: BRAND, scene: 'beach', headline: 'Fresh', language: 'en' }).success).toBe(false);
  });
  it('ships four seasonal themes with unique ids', () => {
    expect(REMIX_THEMES).toHaveLength(4);
    expect(new Set(REMIX_THEMES.map(theme => theme.id)).size).toBe(4);
  });
});

describe('saved ads gallery', () => {
  it('round-trips newest-first and deletes one ad', async () => {
    const db = database();
    const older = ad({ createdAt: '2026-10-29T10:00:00.000Z' });
    const newer = ad({ createdAt: '2026-10-29T11:00:00.000Z', source: 'variants', headline: 'Bold night' });
    await saveAd(older, db);
    await saveAd(newer, db);
    const loaded = await loadSavedAds(db);
    expect(loaded.map(item => item.id)).toEqual([newer.id, older.id]);
    expect(loaded[0].headline).toBe('Bold night');
    await deleteSavedAd(older.id, db);
    expect((await loadSavedAds(db)).map(item => item.id)).toEqual([newer.id]);
  });
});
