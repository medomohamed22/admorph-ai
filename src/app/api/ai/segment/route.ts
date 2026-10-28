import { handleSegmentRequest } from '@/lib/ai/segment-server';
export const maxDuration = 60;
export async function POST(request: Request) { return handleSegmentRequest(request, { timeoutMs: 55000 }); }
