import { getDatabase, type AdMorphDB } from './dexie';
import { browserPrefersArabic } from '../i18n';
import { brandSchema, savedSettingsSchema, cacheSchema, encryptedCredentialSchema, type Brand, type Asset, type SavedSettings, type CatalogCache, type SavedAd } from './schema';

export async function loadWorkspace(db: AdMorphDB = getDatabase()) {
  const [settings, rawBrands, assets] = await Promise.all([db.settings.toArray(), db.brands.toArray(), db.assets.toArray()]);
  const values = Object.fromEntries(settings.map(item => [item.key, item.value]));
  const brands = rawBrands.map(item => brandSchema.parse(item));
  return { locale: values.locale === 'ar' || (values.locale === undefined && browserPrefersArabic()) ? 'ar' as const : 'en' as const,
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
  const parsed=settings?savedSettingsSchema.safeParse(settings.value):null;
  const catalogResults=rawCatalogs.map(item=>cacheSchema.safeParse(item)),vaultResults=rawVault.map(item=>encryptedCredentialSchema.safeParse(item));
  return {settings:parsed?.success?parsed.data:null,catalogs:catalogResults.flatMap(result=>result.success?[result.data]:[]),vault:vaultResults.flatMap(result=>result.success?[result.data]:[]),invalidRecords:!!(parsed&&!parsed.success)||catalogResults.some(result=>!result.success)||vaultResults.some(result=>!result.success)};
}
export async function saveProviderSettings(settings: SavedSettings, caches: CatalogCache[], db: AdMorphDB = getDatabase()) {
  const value = savedSettingsSchema.parse(settings);
  const validated = caches.map(cache => cacheSchema.parse(cache));
  await db.transaction('rw', db.settings, db.modelCatalogCache, async () => {
    const previous = await db.settings.get('providerSettings'); if(previous && !await db.settings.get('legacyProviderSettings-v1')) await db.settings.put({key:'legacyProviderSettings-v1', value:previous.value});
    await db.settings.put({ key: 'providerSettings', value });
    await db.modelCatalogCache.bulkPut(validated);
  });
}

export async function saveAd(ad: SavedAd, db: AdMorphDB = getDatabase()) {
  await db.savedAds.put(ad);
  return ad;
}
export async function loadSavedAds(db: AdMorphDB = getDatabase()) {
  return db.savedAds.orderBy('createdAt').reverse().toArray();
}
export async function deleteSavedAd(id: string, db: AdMorphDB = getDatabase()) {
  await db.savedAds.delete(id);
}
