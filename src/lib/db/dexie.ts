import Dexie, { type Table } from 'dexie';
import type { Campaign } from '../campaign/schema';
import type { Brand, Asset, Setting, CatalogCache, EncryptedCredential } from './schema';

export const DATABASE_NAME = 'admorph-local-v1';
export class AdMorphDB extends Dexie {
  settings!: Table<Setting, string>;
  brands!: Table<Brand, string>;
  assets!: Table<Asset, string>;
  modelCatalogCache!: Table<CatalogCache, string>;
  encryptedCredentials!: Table<EncryptedCredential, string>;
  campaigns!: Table<Campaign, string>;
  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({ settings: 'key', brands: 'id, updatedAt', assets: 'id, kind, createdAt',
      modelCatalogCache: 'providerId, fetchedAt', encryptedCredentials: 'providerId' });
    this.version(2).stores({ campaigns: 'id, brandId, updatedAt' });
  }
}
let database: AdMorphDB | undefined;
export function getDatabase() {
  if (typeof indexedDB === 'undefined') throw new Error('storage_unavailable');
  database ??= new AdMorphDB();
  return database;
}
