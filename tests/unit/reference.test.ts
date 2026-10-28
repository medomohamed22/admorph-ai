import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { referenceLayoutSchema, buildReferencePrompt } from '../../src/lib/ai/reference';
import { handleMetaRoute } from '../../src/lib/ai/meta-runtime';
import { verifyProof } from '../../src/lib/ai/meta-transport';
import { creativeSchema } from '../../src/lib/editor/schema';
import { SAMPLE_BRAND } from '../../src/lib/campaign/schema';

const layout = {
  productZone: 'center' as const,
  headlineZone: 'top' as const,
  ctaZone: 'bottom' as const,
  suggestedTemplate: 'hero-center' as const,
  notes: 'Product centered, copy top and bottom.',
};

describe('reference layout schema and prompt', () => {
  it('parses a valid layout and rejects bad templates and long notes', () => {
    expect(referenceLayoutSchema.safeParse(layout).success).toBe(true);
    expect(referenceLayoutSchema.safeParse({ ...layout, suggestedTemplate: 'grid' }).success).toBe(false);
    expect(referenceLayoutSchema.safeParse({ ...layout, notes: 'x'.repeat(301) }).success).toBe(false);
  });

  it('builds a full-ad prompt that names the brand, scene and reference-only limit', () => {
    const prompt = buildReferencePrompt(SAMPLE_BRAND, 'Calm mornings', 'soft light', 'poolside');
    expect(prompt).toContain('Sora');
    expect(prompt).toContain('poolside');
    expect(prompt).toContain('never be exported');
  });

  it('stores a reference id on the creative without making it a layer', () => {
    const id = crypto.randomUUID();
    const inputLayers = [{ id: crypto.randomUUID(), kind: 'background' as const, x: 0, y: 0, width: 1080, height: 1350, text: '', color: '#000000', fill: '#ffffff', fontFamily: 'Inter' as const, fontSize: 20, visible: true, assetId: null }];
    const parsed = creativeSchema.safeParse({
      id: crypto.randomUUID(), campaignId: crypto.randomUUID(), conceptId: crypto.randomUUID(),
      layers: inputLayers,
      caption: '', source: 'composition', model: null, inputRevision: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), referenceAssetId: id,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.referenceAssetId).toBe(id);
      expect(parsed.data.layers).toEqual(inputLayers);
    }
  });
});

describe('reference routes', () => {
  const request = (body: unknown, path: string) =>
    new Request(`https://app.test/api/ai/${path}`, {
      method: 'POST',
      headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const base = () => ({ providerId: 'meta' as const, apiKey: crypto.randomUUID(), modelId: 'account-model', consent: true as const });
  const envelope = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

  it('generates a reference from the product photo and attests the proof under the image task', async () => {
    const product = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const output = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#8899aa' } }).png().toBuffer();
    const fetcher = vi.fn(async () => Response.json({ data: [{ b64_json: output.toString('base64') }] }));
    const body = { ...base(), imageConsent: true, image: product, brand: SAMPLE_BRAND, headline: 'Calm mornings', visualDirection: 'soft light' };
    const response = await handleMetaRoute(request(body, 'reference'), 'reference', { fetcher });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(verifyProof(response.headers.get('X-AdMorph-Task-Proof')!, body.apiKey, body.modelId, 'image')).toBe(true);
    const sent = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent.images).toHaveLength(1);
  });

  it('rejects reference generation without image consent', async () => {
    const fetcher = vi.fn();
    const product = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const body = { ...base(), imageConsent: false, image: product, brand: SAMPLE_BRAND, headline: 'Calm mornings', visualDirection: 'soft light' };
    const response = await handleMetaRoute(request(body, 'reference'), 'reference', { fetcher });
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('analyzes a reference image into zones and a template, attested under the vision task', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(envelope(layout)));
    const body = { ...base(), imageConsent: true, image };
    const response = await handleMetaRoute(request(body, 'reference-layout'), 'reference-layout', { fetcher });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(layout);
    expect(verifyProof(response.headers.get('X-AdMorph-Task-Proof')!, body.apiKey, body.modelId, 'vision')).toBe(true);
  });
});
