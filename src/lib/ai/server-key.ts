/**
 * The site's own Meta key, set by the owner in the hosting environment
 * (Vercel → Project → Settings → Environment Variables → META_API_KEY).
 * It never reaches the browser: AI routes put it on each request
 * server-side, and the browser only learns whether one is configured.
 * Never prefix it with NEXT_PUBLIC_.
 */
export const SERVER_KEY_ENV = 'META_API_KEY';

/** What the browser sends in place of a key when the site key is in use; the server replaces it. */
export const SITE_KEY_PLACEHOLDER = 'site-key';

export function serverMetaKey(): string | null {
  const value = process.env[SERVER_KEY_ENV]?.trim();
  return value ? value : null;
}

/** Put the site key on a parsed request body, overriding whatever the browser sent. */
export function withServerKey(raw: unknown): unknown {
  const key = serverMetaKey();
  if (!key || !raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return { ...(raw as Record<string, unknown>), apiKey: key };
}
