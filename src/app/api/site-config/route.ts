import { connection } from 'next/server';
import { serverMetaKey } from '@/lib/ai/server-key';

// Tells the browser whether the site's own Meta key is configured, never the
// key itself. connection() keeps this at request time, so adding the key in
// Vercel takes effect on the next deploy without a stale build-time answer.
export async function GET() {
  await connection();
  return Response.json({ siteKey: serverMetaKey() !== null }, { headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
}
