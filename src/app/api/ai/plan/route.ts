import { handlePlanRequest } from '@/lib/ai/planning-server';
export async function POST(request: Request) { return handlePlanRequest(request); }
