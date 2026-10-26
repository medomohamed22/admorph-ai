import { getDatabase, type AdMorphDB } from './dexie';
import { brandSchema, savedSettingsSchema, cacheSchema, encryptedCredentialSchema, type Brand, type Asset, type SavedSettings, type CatalogCache } from './schema';
import { canUseRole } from '../ai/capabilities';
import { roles } from '../ai/schemas';

export async function loadWorkspace(db: AdMorphDB = getDatabase()) {
  const [settings, rawBrands, assets] = await Promise.all([db.settings.toArray(), db.brands.toArray(), db.assets.toArray()]);
  const values = Object.fromEntries(settings.map(item => [item.key, item.value]));
  const brands = rawBrands.map(item => brandSchema.parse(item));
  return { locale: values.locale === 'ar' ? 'ar' as const : 'en' as const,
    activeBrandId: typeof values.activeBrandId === 'string' ? values.activeBrandId : null,
    brands, assets };
}
export async function saveBrand(brand: Brand, asset: Asset | null, previousLogoId: string | null = null, db: AdMorphDB = getDatabase()) {
  brandSchema.parse(brand);
  await db.transaction('rw', db.brands, db.assets, db.settings, async () => {
    if (asset) await db.assets.put(asset);
    await db.brands.put(brand);
    await db.settings.put({ key: 'activeBrandId', value: brand.id });
    if (previousLogoId && previousLogoId !== brand.logoAssetId) await db.assets.delete(previousLogoId);
  });
}
export async function removeBrand(id: string, db: AdMorphDB = getDatabase()) {
  await db.transaction('rw', db.brands, db.assets, db.settings, async () => {
    const brand = await db.brands.get(id);
    if (!brand) return;
    await db.brands.delete(id);
    if (brand.logoAssetId) await db.assets.delete(brand.logoAssetId);
    const active = await db.settings.get('activeBrandId');
    if (active?.value === id) await db.settings.put({ key: 'activeBrandId', value: null });
  });
}
export async function loadProviderSettings(db: AdMorphDB = getDatabase()) {
  const [settings, rawCatalogs, rawVault] = await Promise.all([db.settings.get('providerSettings'), db.modelCatalogCache.toArray(), db.encryptedCredentials.toArray()]);
  const restored = settings ? savedSettingsSchema.parse(settings.value) : null;
  const catalogs = rawCatalogs.map(item => cacheSchema.parse(item));
  if (restored) for (const role of roles) {
    const selected = restored.roles[role];
    if (!selected) continue;
    const model = catalogs.find(cache => cache.providerId === selected.provider)?.models.find(item => item.id === selected.modelId);
    const acknowledgedUnknown = selected.manual && role !== 'image' && model?.capabilities.length === 0 && model.availability !== 'unavailable';
    if ((model && !canUseRole(model, role) && !acknowledgedUnknown) || (role === 'image' && selected.manual)) restored.roles[role] = null;
  }
  return { settings: restored, catalogs, vault: rawVault.map(item => encryptedCredentialSchema.parse(item)) };
}
export async function saveProviderSettings(settings: SavedSettings, caches: CatalogCache[], db: AdMorphDB = getDatabase()) {
  const value = savedSettingsSchema.parse(settings);
  const validated = caches.map(cache => cacheSchema.parse(cache));
  await db.transaction('rw', db.settings, db.modelCatalogCache, async () => {
    await db.settings.put({ key: 'providerSettings', value });
    await db.modelCatalogCache.bulkPut(validated);
  });
}
