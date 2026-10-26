import { handleProviderRequest } from '@/lib/ai/server';
export async function POST(request: Request) { return handleProviderRequest(request, 'test'); }
