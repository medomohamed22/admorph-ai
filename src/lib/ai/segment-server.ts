import { handleMetaRoute } from './meta-runtime';
import type { TransportOptions } from './transport';

// Public handler: Meta only. Delegates to the shared Meta runtime's
// 'segment' operation (SAM 3.1 through the Responses endpoint).
export async function handleSegmentRequest(request: Request, options: TransportOptions = {}) {
  return handleMetaRoute(request, 'segment', options);
}
