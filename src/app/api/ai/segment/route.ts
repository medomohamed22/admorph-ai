import { handleSegmentRequest } from '@/lib/ai/segment-server';
export async function POST(request: Request) { return handleSegmentRequest(request); }
