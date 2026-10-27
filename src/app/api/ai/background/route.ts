import { handleBackgroundRequest } from '@/lib/ai/image-server';
export async function POST(request: Request) { return handleBackgroundRequest(request); }
