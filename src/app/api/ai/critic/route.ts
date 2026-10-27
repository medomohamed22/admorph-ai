import { handleCriticRequest } from '@/lib/ai/critic-server';
export async function POST(request: Request) { return handleCriticRequest(request); }
