import { handleMetaRoute } from '@/lib/ai/meta-runtime';
// Web search runs on Meta's side and can take a while.
export const maxDuration = 90;
export async function POST(request: Request) { return handleMetaRoute(request, 'market-research', { timeoutMs: 85000 }); }
