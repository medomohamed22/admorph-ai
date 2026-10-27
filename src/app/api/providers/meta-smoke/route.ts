import { handleMetaSmoke } from '@/lib/ai/meta-smoke-server';
export async function POST(request: Request) { return handleMetaSmoke(request); }
