import { handleMetaRoute } from '@/lib/ai/meta-runtime';
export const maxDuration = 60;
export async function POST(request: Request) { return handleMetaRoute(request, 'shelf-plan', { timeoutMs: 55000 }); }
