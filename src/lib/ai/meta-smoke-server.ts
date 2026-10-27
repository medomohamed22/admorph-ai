import { z } from 'zod';
import {acquireBudget} from '../security/ai-budget';
import { ProviderError, httpError } from './errors';
import { providers } from './registry';
import { readJsonLimited, type TransportOptions } from './transport';
import { metaSmokeRequestSchema } from './meta-smoke-schema';
export async function handleMetaSmoke(request: Request, options: TransportOptions = {}) {
  const headers = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
  let release:(()=>void)|undefined;
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new ProviderError('origin', 403);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new ProviderError('invalid_request', 415);
    const parsed = metaSmokeRequestSchema.safeParse(await readJsonLimited(request, 12000)); if (!parsed.success) throw new ProviderError('invalid_request');
    const input = parsed.data, deadline = AbortSignal.timeout(options.timeoutMs ?? 45000), signal = AbortSignal.any([deadline, request.signal]);
    release=acquireBudget(input.apiKey);
    try {
      const response = await (options.fetcher ?? fetch)(`${providers.meta.baseUrl}/${input.kind === 'text' ? 'chat/completions' : 'images/generations'}`, {
        method: 'POST', headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input.kind === 'text' ? { model: input.modelId, messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_completion_tokens: 512, reasoning_effort: 'minimal', stream: false } : { model: input.modelId, prompt: 'Create a simple abstract green circle on a cream background. No text, logos, products, people or real-world references.', n: 1, response_format: 'b64_json', output_format: 'png' }),
        signal, redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) { const reason = JSON.stringify(await readJsonLimited(response, 32768).catch(() => null));
        if (/insufficient_quota|quota_exceeded/i.test(reason ?? '')) throw new ProviderError('quota', 429);
        throw response.status === 400 ? new ProviderError('meta_response') : httpError(response.status);
      }
      const json = await readJsonLimited(response, input.kind === 'text' ? 100000 : 5 * 1024 * 1024);
      const clean = (text: string) => text.split(input.apiKey).join('[redacted]');
      if (input.kind === 'text') {
        const text = z.object({ id: z.string().max(200).optional(), choices: z.array(z.object({ finish_reason: z.string(), message: z.object({ content: z.string().max(2000) }) })).min(1) }).parse(json);
        if (text.choices[0].finish_reason !== 'stop' || text.choices[0].message.content.trim().toLowerCase() !== 'ready') throw new ProviderError('meta_response', 502);
        return Response.json({ kind: 'text', source: 'live', checkedAtUTC: new Date().toISOString(), modelId: clean(input.modelId), reply: 'ready', requestId: text.id ? clean(text.id) : null }, { headers });
      }
      const image = z.object({ data: z.array(z.object({ b64_json: z.string().max(4 * Math.ceil(3 * 1024 * 1024 / 3)).regex(/^[A-Za-z0-9+/]+={0,2}$/) })).length(1), output_format: z.enum(['png', 'jpeg', 'webp']).optional() }).parse(json);
      const bytes = Buffer.from(image.data[0].b64_json, 'base64');
      const { default: sharp } = await import('sharp'), metadata = await sharp(bytes, { limitInputPixels: 4096 * 4096 }).metadata();
      if (bytes.length > 3 * 1024 * 1024 || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || metadata.pages && metadata.pages > 1) throw new ProviderError('meta_response', 502);
      return new Response(new Uint8Array(bytes), { headers: { ...headers, 'Content-Type': `image/${metadata.format}`, 'X-AdMorph-Source': 'live', 'X-AdMorph-Model': clean(input.modelId), 'X-AdMorph-Checked-At': new Date().toISOString() } });
    } catch (error) {
      if (request.signal.aborted) throw new ProviderError('cancelled', 499);
      if (deadline.aborted) throw new ProviderError('timeout', 504);
      throw error instanceof ProviderError ? error : new ProviderError('meta_response', 502);
    }
  } catch (error) { const safe = error instanceof ProviderError ? error : new ProviderError('meta_response', 502); return Response.json({ error: { code: safe.code } }, { headers, status: safe.status }); } finally { release?.(); }
}
