import {accountContext,supportOutcome,supportSchema,type MetaTask} from './task-support';
import {readJsonLimited} from './transport';
import {errorCodes} from './errors';
import {z} from 'zod';
export const supportEventSchema=supportSchema.omit({id:true,checkedAt:true,expiresAt:true});
/** A successful HTTP response carries a task proof only after server validation. */
export async function metaFetch(task:MetaTask,url:string,init:RequestInit){
 const response=await fetch(url,init);
 if(typeof window==='undefined'||init.signal?.aborted)return response;
 const input=JSON.parse(String(init.body)) as {apiKey:string;modelId:string};
 const proof=response.headers.get('X-AdMorph-Task-Proof');
 const error=response.ok?null:z.object({error:z.object({code:z.enum(errorCodes)})}).safeParse(await readJsonLimited(response.clone(),4096).catch(()=>null));
 if(proof||error?.success){const account=await accountContext(input.apiKey),code=error?.success?error.data.error.code:null;const detail=supportEventSchema.parse({account,modelId:input.modelId,task,status:proof?'verified_supported':supportOutcome(code??'invalid_response'),reason:proof?'task_response_validated':code,proof:proof??undefined});if(!init.signal?.aborted)window.dispatchEvent(new CustomEvent('admorph-meta-support',{detail}));}
 return response;
}
