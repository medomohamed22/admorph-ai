import {z} from 'zod';
// Model IDs are JSON values, never interpolated into a Meta endpoint URL.
export const metaModelId=z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/).refine(value=>!value.split('/').some(part=>!part||part==='.'||part==='..'),'invalid_model_id');
