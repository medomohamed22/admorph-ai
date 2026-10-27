import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { AdMorphDB } from '../../src/lib/db/dexie';
import { loadWorkspace, loadProviderSettings, saveBrand, removeBrand, saveProviderSettings } from '../../src/lib/db/repository';
import { makeBrandBackup, parseBrandBackup, validateLogo, MAX_LOGO_BYTES, MAX_BACKUP_BYTES } from '../../src/lib/brand/backup';
import { encryptCredential, decryptCredential } from '../../src/lib/security/credentials';
import { themeColors } from '../../src/lib/brand/theme';
import { contrastRatio } from '../../src/lib/editor/checks';
import type { Brand, BrandInput } from '../../src/lib/db/schema';

const databases: AdMorphDB[] = [];
function database() { const db = new AdMorphDB(`test-admorph-${crypto.randomUUID()}`); databases.push(db); return db; }
afterEach(async () => { for (const db of databases.splice(0)) await db.delete(); });
const brandInput: BrandInput = { name: 'Sora fixture', description: 'An editable local brand.', colors: ['#fefefe', '#101010', '#abcd12'] };
const png = new Blob([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aexkAAAAASUVORK5CYII='), char => char.charCodeAt(0))], { type: 'image/png' });
function record(): Brand { return { ...brandInput, id: crypto.randomUUID(), logoAssetId: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; }

describe('Dexie local persistence', () => {
  it('round-trips brand metadata, a separate logo Blob, language and active brand', async () => {
    const db = database(), brand = record();
    await saveBrand(brand, { id: brand.logoAssetId!, blob: png, kind: 'logo', createdAt: brand.createdAt }, null, db);
    await db.settings.put({ key: 'locale', value: 'ar' });
    const restored = await loadWorkspace(db);
    expect(restored.locale).toBe('ar'); expect(restored.activeBrandId).toBe(brand.id);
    expect(restored.brands).toEqual([brand]);
    expect(restored.assets[0].blob).toBeInstanceOf(Blob);
    expect(await restored.assets[0].blob.arrayBuffer()).toEqual(await png.arrayBuffer());
  });
  it('atomically replaces a logo without leaving an orphan and deletes only the chosen brand', async () => {
    const db = database(), brand = record(), other = record();
    await saveBrand(brand, { id: brand.logoAssetId!, blob: png, kind: 'logo', createdAt: brand.createdAt }, null, db);
    await saveBrand(other, { id: other.logoAssetId!, blob: png, kind: 'logo', createdAt: other.createdAt }, null, db);
    const updated = { ...brand, logoAssetId: crypto.randomUUID() };
    await saveBrand(updated, { id: updated.logoAssetId, blob: png, kind: 'logo', createdAt: brand.createdAt }, brand.logoAssetId, db);
    expect(await db.assets.get(brand.logoAssetId!)).toBeUndefined();
    await removeBrand(updated.id, db);
    expect(await db.brands.get(other.id)).toEqual(other);
    expect(await db.assets.get(other.logoAssetId!)).toBeDefined();
    expect((await db.settings.get('activeBrandId'))?.value).toBeNull();
  });
  it('persists non-secret settings and timestamped catalog metadata', async () => {
    const db = database(); const model = { provider: 'gemini' as const, modelId: 'fixture-text' };
    const settings = { provider: 'gemini' as const, customBaseUrl: '', roles: { planner: model, critic: model, edit: model, image: null } };
    const cache = { providerId: 'gemini' as const, models: [], fetchedAt: new Date().toISOString() };
    await saveProviderSettings(settings, [cache], db);
    const loaded = await loadProviderSettings(db);
    expect(loaded.settings).toEqual(settings); expect(loaded.catalogs).toEqual([cache]);
    expect(JSON.stringify(await db.settings.toArray())).not.toContain('apiKey');
    await expect(saveProviderSettings({ ...settings, apiKey: 'should-not-save' } as typeof settings, [], db)).rejects.toThrow();
  });
  it('defaults to English independently of device locale', async () => {
    expect((await loadWorkspace(database())).locale).toBe('en');
  });
  it('preserves inactive legacy roles without overwriting user records', async () => {
    const db = database(); const selected = { provider: 'gemini' as const, modelId: 'fixture-text' };
    await saveProviderSettings({ provider: 'gemini', customBaseUrl: '', roles: { planner: selected, critic: selected, edit: selected, image: selected } },
      [{ providerId: 'gemini', fetchedAt: new Date().toISOString(), models: [{ id: 'fixture-text', name: 'Fixture', provider: 'gemini', capabilities: ['text'], availability: 'unknown' }] }], db);
    const loaded = await loadProviderSettings(db);
    expect(loaded.settings?.roles.planner).toEqual(selected);
    expect(loaded.settings?.roles.image).toEqual(selected);
  });
  it('preserves acknowledged manual text models when capability metadata is omitted', async () => {
    const db = database(); const selected = { provider: 'meta' as const, modelId: 'fixture-unknown', manual: true };
    await saveProviderSettings({ provider: 'meta', customBaseUrl: '', roles: { planner: selected, critic: selected, edit: selected, image: null } },
      [{ providerId: 'meta', fetchedAt: new Date().toISOString(), models: [{ id: 'fixture-unknown', name: 'Fixture', provider: 'meta', capabilities: [], availability: 'unknown' }] }], db);
    expect((await loadProviderSettings(db)).settings?.roles.planner).toEqual(selected);
  });
});

describe('portable brand format', () => {
  it('round-trips all brand fields and exact logo bytes', async () => {
    const backup = await makeBrandBackup(brandInput, png);
    expect(JSON.parse(backup)).toMatchObject({ format: 'admorph-brand-kit', version: 1 });
    expect(backup).not.toContain('apiKey'); expect(backup).not.toContain('passphrase');
    const parsed = await parseBrandBackup(backup);
    expect(parsed.brand).toEqual(brandInput); expect(parsed.logo?.type).toBe('image/png');
    expect(await parsed.logo?.arrayBuffer()).toEqual(await png.arrayBuffer());
  });
  it('supports a brand without a logo', async () => {
    expect((await parseBrandBackup(await makeBrandBackup(brandInput, null))).logo).toBeNull();
  });
  it.each([
    { name: '', description: 'description', colors: ['#ffffff', '#000000', '#123456'] },
    { name: 'name', description: '', colors: ['#ffffff', '#000000', '#123456'] },
    { name: 'name', description: 'description', colors: ['red', '#000000', '#123456'] },
  ])('rejects invalid brand inputs %#', async input => {
    await expect(makeBrandBackup(input as BrandInput, null)).rejects.toMatchObject({ code: 'invalidBrand' });
  });
  it('rejects unknown versions, embedded secrets, malformed files and scriptable logos', async () => {
    const valid = JSON.parse(await makeBrandBackup(brandInput, null));
    for (const malformed of [{ ...valid, version: 99 }, { ...valid, apiKey: 'untrusted' }, { ...valid, brand: { ...valid.brand, logo: 'data:image/svg+xml;base64,PHN2Zz4=' } }]) {
      await expect(parseBrandBackup(JSON.stringify(malformed))).rejects.toMatchObject({ code: 'invalidBackup' });
    }
    await expect(parseBrandBackup('not json')).rejects.toMatchObject({ code: 'invalidBackup' });
    await expect(parseBrandBackup('x'.repeat(MAX_BACKUP_BYTES + 1))).rejects.toMatchObject({ code: 'backupSize' });
  });
  it('rejects MIME spoofing, SVG files, and oversized logos', async () => {
    await expect(validateLogo(new Blob(['<svg onload="alert(1)"></svg>'], { type: 'image/png' }))).rejects.toMatchObject({ code: 'invalidLogo' });
    await expect(validateLogo(new Blob(['<svg/>'], { type: 'image/svg+xml' }))).rejects.toMatchObject({ code: 'invalidLogo' });
    await expect(validateLogo(new Blob([new Uint8Array(MAX_LOGO_BYTES + 1)], { type: 'image/png' }))).rejects.toMatchObject({ code: 'logoSize' });
  });
});

describe('credential encryption', () => {
  const dummy = 'fixture-key-never-real', passphrase = 'fixture passphrase with enough length';
  it('encrypts with randomized salt/IV and requires the passphrase after restore', async () => {
    const first = await encryptCredential('gemini', dummy, passphrase), second = await encryptCredential('gemini', dummy, passphrase);
    expect(first.ciphertext).not.toEqual(second.ciphertext); expect(first.salt).toHaveLength(16); expect(first.iv).toHaveLength(12);
    expect(JSON.stringify(first)).not.toContain(dummy); expect(JSON.stringify(first)).not.toContain(passphrase);
    expect(await decryptCredential(first, passphrase)).toBe(dummy);
    await expect(decryptCredential(first, 'wrong passphrase')).rejects.toMatchObject({ code: 'unlockFailed' });
  });
  it('rejects tampering and binding a key to a different provider or custom endpoint', async () => {
    const saved = await encryptCredential('custom', dummy, passphrase, 'https://example.com/v1');
    await expect(decryptCredential({ ...saved, providerId: 'meta' }, passphrase)).rejects.toMatchObject({ code: 'unlockFailed' });
    await expect(decryptCredential({ ...saved, baseUrl: 'https://other.example/v1' }, passphrase)).rejects.toMatchObject({ code: 'unlockFailed' });
    await expect(decryptCredential({ ...saved, ciphertext: saved.ciphertext.map((n, i) => i ? n : n ^ 1) }, passphrase)).rejects.toMatchObject({ code: 'unlockFailed' });
  });
  it('requires a nontrivial passphrase', async () => {
    await expect(encryptCredential('meta', dummy, 'short')).rejects.toMatchObject({ code: 'passphrase' });
  });
});

it('keeps brand-colored buttons and accents readable even for white/black palettes', () => {
  for (const color of ['#ffffff', '#000000', '#ffee00', '#888888']) {
    const theme = themeColors([color, color, color]);
    expect(contrastRatio(theme.foreground, theme.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.secondaryForeground, theme.secondary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(theme.readableAccent, '#f8f7f3')).toBeGreaterThanOrEqual(4.5);
  }
});
