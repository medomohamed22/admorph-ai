import {handleMetaRoute} from './meta-runtime';
import type {TransportOptions} from './transport';
export const handlePlanRequest=(request:Request,options:TransportOptions={})=>handleMetaRoute(request,'planner',options);
