import { z } from 'zod';
export const taskSchema=z.enum(['planner','image','critic','edit','vision','image_edit','copy','segment']);
export type MetaTask=z.infer<typeof taskSchema>;
export const supportSchema=z.object({id:z.string(),account:z.string(),modelId:z.string(),task:taskSchema,status:z.enum(['verified_supported','unverified','verified_unsupported']),reason:z.string().max(180),checkedAt:z.string().datetime(),expiresAt:z.string().datetime(),proof:z.string().max(1500).optional()}).strict();
export type TaskSupport=z.infer<typeof supportSchema>;
export const supportStatus=(records:TaskSupport[],account:string,modelId:string,task:MetaTask,now?:number)=>records.find(row=>row.account===account&&row.modelId===modelId&&row.task===task&&Date.parse(row.expiresAt)>(now??Date.now()))?.status??'unverified';
// A one-way account context prevents reuse of another key's verification without persisting that key.
export async function accountContext(key:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`admorph-meta-account-v1:${key}`));return Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('');}
export function supportOutcome(code:string){return code==='unsupported_task'?'verified_unsupported':'unverified';}
