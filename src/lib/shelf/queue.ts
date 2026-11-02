import { ProviderError } from '../ai/errors';

/**
 * The AI routes allow one request at a time and six a minute per key. A
 * shelf campaign makes more than that, so every call goes through this
 * runner: on a rate limit it waits (telling the UI how long) and tries
 * again, up to `attempts` times. Any other error is thrown at once.
 */
export async function withRateLimit<T>(call: () => Promise<T>, onWait?: (seconds: number) => void, attempts = 6, waitSeconds = 12, sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await call(); }
    catch (cause) {
      if (!(cause instanceof ProviderError) || cause.code !== 'rate_limit' || attempt >= attempts) throw cause;
      onWait?.(waitSeconds);
      await sleep(waitSeconds * 1000);
      onWait?.(0);
    }
  }
}

/**
 * Run `worker` over `items` with at most `limit` running at once, in order of
 * start. Each worker handles its own errors. With the site's Meta key several
 * paintings run side by side; a visitor's own key allows one request at a
 * time, so it stays at one lane.
 */
export async function runPool<T>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) { const index = next++; await worker(items[index], index); }
  });
  await Promise.all(lanes);
}

/** How many paintings run at once: three with the site's key, one with a visitor's own key. */
export function paintLanes(siteKey: 'checking' | 'ready' | 'missing'): number {
  return siteKey === 'ready' ? 3 : 1;
}
