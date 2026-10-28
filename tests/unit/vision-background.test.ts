import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  SCALE_GEOMETRY,
  BACKGROUND_NEGATIVE_CONSTRAINTS,
  BACKGROUND_NEGATIVE_CONSTRAINTS_STRICT,
  buildVisionBrief,
  withStrictNegatives,
  buildBackgroundPrompt,
  visionBackgroundAnalysisSchema,
  checkBackgroundSchema,
  type VisionBackgroundAnalysis,
} from '../../src/lib/background/brief';
import { handleMetaRoute } from '../../src/lib/ai/meta-runtime';
import { verifyProof } from '../../src/lib/ai/meta-transport';
import { blobToBase64 } from '../../src/lib/cutout/raster';

const analysis: VisionBackgroundAnalysis = {
  productCategory: 'cold brew can',
  material: 'matte aluminum, condensation',
  mood: 'fresh, icy',
  lighting: 'bright daylight',
  productScale: 'large-center',
  sceneIdeas: [
    { scene: 'Poolside still life with ice', setting: 'poolside', reason: 'Cold cues match the drink.' },
    { scene: 'Ice blocks studio backdrop', setting: 'ice studio', reason: 'Minimal and premium.' },
    { scene: 'Summer picnic table', setting: 'picnic', reason: 'Casual refreshment moment.' },
  ],
};

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('vision-first background brief', () => {
  it('keeps every scale geometry inside the canvas with no text/product overlap', () => {
    for (const scale of Object.keys(SCALE_GEOMETRY) as (keyof typeof SCALE_GEOMETRY)[]) {
      const geometry = SCALE_GEOMETRY[scale];
      const product = geometry.productRect;
      expect(product.x).toBeGreaterThanOrEqual(0);
      expect(product.y).toBeGreaterThanOrEqual(0);
      expect(product.x + product.width).toBeLessThanOrEqual(1080);
      expect(product.y + product.height).toBeLessThanOrEqual(1350);
      for (const text of geometry.textRects) expect(overlaps(product, text)).toBe(false);
    }
  });

  it('builds a brief from the chosen scene with the scale geometry', () => {
    const brief = buildVisionBrief(analysis, 1, ['#16100C', '#F5EEDF', '#7ED3E0']);
    expect(brief.scene).toBe('Ice blocks studio backdrop');
    expect(brief.sceneReason).toBe('Minimal and premium.');
    expect(brief.productScale).toBe('large-center');
    expect(brief.reservedProductRect).toEqual(SCALE_GEOMETRY['large-center'].productRect);
    expect(brief.stylePreset).toBe('hero');
    expect(brief.negativeConstraints).toEqual([...BACKGROUND_NEGATIVE_CONSTRAINTS]);
    const side = buildVisionBrief({ ...analysis, productScale: 'medium-left' }, 0, ['#16100C', '#F5EEDF', '#7ED3E0']);
    expect(side.reservedProductRect).toEqual(SCALE_GEOMETRY['medium-left'].productRect);
    expect(side.stylePreset).toBe('dynamic');
  });

  it('strict negatives extend the base set for the retry attempt', () => {
    const brief = buildVisionBrief(analysis, 0, ['#16100C', '#F5EEDF', '#7ED3E0']);
    const strict = withStrictNegatives(brief);
    expect(strict.negativeConstraints).toEqual([...BACKGROUND_NEGATIVE_CONSTRAINTS_STRICT]);
    expect(strict.scene).toBe(brief.scene);
  });

  it('renders scene and scale notes into the prompt, and omits them when absent', () => {
    const brief = buildVisionBrief(analysis, 0, ['#16100C', '#F5EEDF', '#7ED3E0']);
    const prompt = buildBackgroundPrompt(brief);
    expect(prompt).toContain('Poolside still life with ice');
    expect(prompt).toContain('large and centered');
    expect(prompt).toContain('no product');
    const legacy = buildBackgroundPrompt({ ...brief, scene: undefined, sceneReason: undefined, productScale: undefined });
    expect(legacy).not.toContain('Scene:');
  });

  it('requires exactly three scene ideas and rejects extra keys', () => {
    expect(visionBackgroundAnalysisSchema.safeParse({ ...analysis, sceneIdeas: analysis.sceneIdeas.slice(0, 2) }).success).toBe(false);
    expect(visionBackgroundAnalysisSchema.safeParse({ ...analysis, extra: true }).success).toBe(false);
    expect(checkBackgroundSchema.safeParse({ hasProduct: true, found: 'a can' }).success).toBe(true);
    expect(checkBackgroundSchema.safeParse({ found: 'a can' }).success).toBe(false);
  });

  it('round-trips blobs through base64', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const encoded = await blobToBase64(new Blob([bytes]));
    expect(Buffer.from(encoded, 'base64')).toEqual(Buffer.from(bytes));
  });
});

describe('vision background routes', () => {
  const request = (body: unknown, path: string) =>
    new Request(`https://app.test/api/ai/${path}`, {
      method: 'POST',
      headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const base = () => ({ providerId: 'meta' as const, apiKey: crypto.randomUUID(), modelId: 'account-model', consent: true as const });
  const envelope = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

  it('analyzes a product photo and attests the proof under the vision task', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(envelope(analysis)));
    const body = { ...base(), imageConsent: true, image };
    const response = await handleMetaRoute(request(body, 'vision-background'), 'vision-background', { fetcher });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(analysis);
    expect(verifyProof(response.headers.get('X-AdMorph-Task-Proof')!, body.apiKey, body.modelId, 'vision')).toBe(true);
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.messages[1].content[1].type).toBe('image_url');
  });

  it('checks a generated background for products', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(envelope({ hasProduct: true, found: 'a can' })));
    const response = await handleMetaRoute(
      request({ ...base(), imageConsent: true, image }, 'check-background'),
      'check-background',
      { fetcher },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasProduct: true, found: 'a can' });
  });

  it('rejects vision calls without image consent', async () => {
    const fetcher = vi.fn();
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const response = await handleMetaRoute(
      request({ ...base(), imageConsent: false, image }, 'vision-background'),
      'vision-background',
      { fetcher },
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aborts a hung vision call with a clean timeout error', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        }),
    );
    const response = await handleMetaRoute(
      request({ ...base(), imageConsent: true, image }, 'vision-background'),
      'vision-background',
      { fetcher, timeoutMs: 50 },
    );
    expect(response.status).toBe(504);
    expect((await response.json() as { error: { code: string } }).error.code).toBe('timeout');
  });
});
