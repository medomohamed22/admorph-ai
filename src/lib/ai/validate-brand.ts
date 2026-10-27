import {z} from 'zod';
import {extractRequest,extractedSchema} from './meta-contracts';
import {validateRaster} from './meta-transport';
import {readJsonLimited} from './transport';
import {validationFields} from './diagnostics';
import {ProviderError} from './errors';
/** Optional local diagnostics only. This route never calls Meta. */
export async function handleBrandValidation(request:Request){const headers={'Cache-Control':'no-store, private'};try{if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new ProviderError('origin',403);if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new ProviderError('invalid_request',415);const input=extractRequest.parse(await readJsonLimited(request,3*1024*1024));const bytes=await validateRaster(input.image);z.toJSONSchema(extractedSchema);return Response.json({status:'valid',modelId:input.modelId,imageType:input.image.mimeType,imageBytes:bytes.length,metaRequests:0},{headers});}catch(error){const code=error instanceof ProviderError?error.code:error instanceof z.ZodError?'invalid_request':'upstream',status=error instanceof ProviderError?error.status:error instanceof z.ZodError?400:500;return Response.json({error:{code,details:{source:error instanceof z.ZodError?'application':'internal',...(error instanceof z.ZodError?{fields:validationFields(error)}:{})}}},{headers,status});}}
