import Dexie, { type Table } from 'dexie';
import type { Campaign } from '../campaign/schema';
import type { Creative } from '../editor/schema';
import type { ReviewRecord } from '../critic/schema';
import type { RepairReceipt } from '../repair/schema';
import type { Brand, Asset, Setting, CatalogCache, EncryptedCredential } from './schema';
import type {TaskSupport} from '../ai/task-support';
import type {ProductVariant,DesignVersion} from '../editor/enhancements-schema';

export const DATABASE_NAME = 'admorph-local-v1';
export class AdMorphDB extends Dexie {
  settings!: Table<Setting, string>;
  brands!: Table<Brand, string>;
  assets!: Table<Asset, string>;
  modelCatalogCache!: Table<CatalogCache, string>;
  encryptedCredentials!: Table<EncryptedCredential, string>;
  campaigns!: Table<Campaign, string>;
  creatives!: Table<Creative, string>;
  creativeReviews!: Table<ReviewRecord, string>;
  repairHistory!: Table<RepairReceipt, string>;
  taskSupport!:Table<TaskSupport,string>;
  productVariants!:Table<ProductVariant,string>;
  designVersions!:Table<DesignVersion,string>;
  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({ settings: 'key', brands: 'id, updatedAt', assets: 'id, kind, createdAt',
      modelCatalogCache: 'providerId, fetchedAt', encryptedCredentials: 'providerId' });
    this.version(2).stores({ campaigns: 'id, brandId, updatedAt' });
    this.version(3).stores({ creatives: 'id, campaignId, conceptId, updatedAt' });
    this.version(4).stores({ creativeReviews: 'id, creativeId, reviewedAt' });
    this.version(5).stores({ repairHistory: 'id, creativeId, appliedAt' });
    this.version(6).stores({taskSupport:'id, account, modelId, task',productVariants:'id, campaignId, assetId',designVersions:'id, creativeId, createdAt'});
  }
}
let database: AdMorphDB | undefined;
export function getDatabase() {
  if (typeof indexedDB === 'undefined') throw new Error('storage_unavailable');
  database ??= new AdMorphDB();
  return database;
}
