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
