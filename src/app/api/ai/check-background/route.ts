import { handleMetaRoute } from '@/lib/ai/meta-runtime';
export async function POST(request: Request) { return handleMetaRoute(request, 'check-background'); }
