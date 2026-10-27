import { handleRepairRequest } from '@/lib/ai/repair-server';
export async function POST(request: Request) { return handleRepairRequest(request); }
