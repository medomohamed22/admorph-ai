export const errorCodes = ['missing_key', 'consent', 'invalid_request', 'custom_server', 'origin',
  'invalid_url', 'unauthorized', 'forbidden', 'rate_limit', 'quota', 'invalid_model',
  'timeout', 'network', 'cors', 'invalid_response', 'upstream', 'catalog_limit', 'cancelled',
  'storage_error', 'role_capability', 'manual_id', 'manual_ack', 'incomplete_roles',
  'campaign_input', 'product_image', 'product_size', 'product_dimensions', 'unsupported_planner',
  'plan_invalid', 'plan_blocked', 'plan_truncated', 'image_input', 'image_response', 'image_shape', 'image_model', 'export_error', 'review_input', 'review_invalid', 'review_preview', 'repair_invalid', 'repair_stale', 'repair_assets', 'meta_response','meta_only','unsupported_task','unverified_task','sam_unavailable','sam_no_text','sam_no_mask'] as const;
export type ErrorCode = typeof errorCodes[number];
export type ErrorDetails={source:'application'|'meta'|'internal';message?:string;fields?:string[];parameter?:string;upstreamStatus?:number;requestId?:string};
export class ProviderError extends Error {
  constructor(public code: ErrorCode, public status = 400,public details?:ErrorDetails) { super(code); }
}
export function httpError(status: number): ProviderError {
  const code: ErrorCode = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' :
    status === 429 ? 'rate_limit' : status === 404 ? 'invalid_model' : 'upstream';
  return new ProviderError(code, status);
}
export function errorCode(error: unknown): ErrorCode {
  return error instanceof ProviderError ? error.code : 'invalid_response';
}
