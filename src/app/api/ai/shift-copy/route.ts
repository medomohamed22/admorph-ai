import {handleMetaRoute} from '@/lib/ai/meta-runtime';
export function POST(request:Request){return handleMetaRoute(request,'copy');}
