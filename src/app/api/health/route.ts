import { connection } from 'next/server';
import { META_MODELS } from '@/lib/ai/models';
import { serverMetaKey } from '@/lib/ai/server-key';

// A small, honest status page for anyone who opens it (a reviewer, a deploy check).
// It says whether the site's own Meta key is configured, never the key, and which fixed
// Meta models run each job. connection() keeps it at request time, so adding the key in
// Vercel shows up on the next deploy instead of a stale build-time answer.
export async function GET() {
  await connection();
  return Response.json({
    status: 'ok',
    app: 'AdMorph AI',
    aiProvider: 'meta',
    mode: 'site-key',
    siteKeyConfigured: serverMetaKey() !== null,
    models: { brain: META_MODELS.spark.id, cutter: META_MODELS.sam.id, painter: META_MODELS.image.id },
    storage: 'browser-indexeddb',
  }, { headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
}
