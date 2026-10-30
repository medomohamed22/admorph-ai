import { handlePlanRequest } from '@/lib/ai/planning-server';
// Planning three concepts from a product photo can take close to a minute,
// like the other vision routes: allow the same 60s window.
export const maxDuration = 60;
export async function POST(request: Request) { return handlePlanRequest(request, { timeoutMs: 55000 }); }
