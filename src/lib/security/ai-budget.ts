import { createHash } from 'node:crypto';
import { ProviderError } from '../ai/errors';
const buckets=new Map<string,{minute:number;count:number;day:number;daily:number;active:number}>();
let activeTotal=0;
export function acquireBudget(apiKey:string,now=Date.now()){
 const id=createHash('sha256').update(apiKey).digest('hex');
 for(const [key,value]of buckets)if(value.active===0&&now-value.day>86400000)buckets.delete(key);
 if(buckets.size>=1000&&!buckets.has(id))throw new ProviderError('rate_limit',429);
 const bucket=buckets.get(id)??{minute:now,count:0,day:now,daily:0,active:0};
 if(now-bucket.minute>=60000){bucket.minute=now;bucket.count=0;}if(now-bucket.day>=86400000){bucket.day=now;bucket.daily=0;}
 if(activeTotal>=4||bucket.active>=1||bucket.count>=6||bucket.daily>=100)throw new ProviderError('rate_limit',429);
 bucket.active++;activeTotal++;bucket.count++;bucket.daily++;buckets.set(id,bucket);let done=false;
 return()=>{if(!done){bucket.active--;activeTotal--;done=true;}};
}
