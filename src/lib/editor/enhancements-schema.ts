import {z} from 'zod';
import {creativeSchema} from './schema';
export const variantSchema=z.object({id:z.string().uuid(),assetId:z.string().uuid(),originalAssetId:z.string().uuid(),campaignId:z.string().uuid(),mode:z.enum(['sample','enhance','recreate']),preset:z.enum(['clean','luxury','lifestyle','minimal']),modelId:z.string().max(160).nullable(),prompt:z.string().max(1000),approved:z.boolean(),createdAt:z.string().datetime()}).strict();
export type ProductVariant=z.infer<typeof variantSchema>;
export const designVersionSchema=z.object({id:z.string().uuid(),creativeId:z.string().uuid(),createdAt:z.string().datetime(),snapshot:creativeSchema}).strict();
export type DesignVersion=z.infer<typeof designVersionSchema>;
