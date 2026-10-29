import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { handleSegmentRequest } from '../../src/lib/ai/segment-server';
import { handleMetaRoute } from '../../src/lib/ai/meta-runtime';
import { verifyProof } from '../../src/lib/ai/meta-transport';
import { parseSegmentResponse, segmentErrorBody } from '../../src/lib/cutout/sam-client';
import { findCutoutAsset } from '../../src/lib/cutout/provenance';
import type { Asset } from '../../src/lib/db/schema';

// Same documented example as the SAM unit tests: frame 0, two objects.
const README_OUTPUT =
  '<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>' +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ',1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>' +
  '<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n';

const responsesEnvelope = (text: string) => ({
  output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
});

const request = (body: unknown) =>
  new Request('https://app.test/api/ai/segment', {
    method: 'POST',
    headers: { Origin: 'https://app.test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const base = () => ({
  providerId: 'meta' as const,
  apiKey: crypto.randomUUID(),
  modelId: 'sam-3.1',
  consent: true as const,
});

describe('SAM segment route', () => {
  it('parses Responses output_text into masks with base64 rasters', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(responsesEnvelope(README_OUTPUT)));
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: true, image, prompt: 'product' }),
      { fetcher },
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.masks).toHaveLength(2);
    const first = data.masks.find((mask: { objectId: string }) => mask.objectId === '0');
    expect([first.left, first.top, first.right, first.bottom]).toEqual([211, 228, 271, 255]);
    expect([first.width, first.height]).toEqual([60, 27]);
    expect(Buffer.from(first.rasterBase64, 'base64').length).toBe(60 * 27);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.meta.ai/v1/responses');
    const body = JSON.parse(String(init.body));
    expect(body.input[0].content[1].type).toBe('input_image');
    expect(String(init.body)).not.toContain(base().apiKey);
  });

  it('reports sam_no_mask instead of an empty mask list when SAM finds nothing', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(responsesEnvelope('no objects here')));
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: true, image, prompt: 'product' }),
      { fetcher },
    );
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe('sam_no_mask');
  });

  it('rejects a segment request without image consent', async () => {
    const fetcher = vi.fn();
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: false, image, prompt: 'product' }),
      { fetcher },
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('verifies the segment task through the settings test path', async () => {
    const body = { ...base(), task: 'segment' as const, imageConsent: true as const };
    const fetcher = vi.fn(async () => Response.json(responsesEnvelope(README_OUTPUT)));
    const result = await handleMetaRoute(request(body), 'test', { fetcher });
    const data = await result.json();
    expect(data).toMatchObject({ modelId: body.modelId, task: 'segment', status: 'verified_supported' });
    expect(verifyProof(data.proof, body.apiKey, body.modelId, 'segment')).toBe(true);
  });
});

describe('segment response mapping', () => {
  it('round-trips rasters and drops malformed records', () => {
    const bytes = new Uint8Array([0, 1, 1, 0]);
    const good = {
      objectId: 'p',
      left: 0,
      top: 0,
      right: 2,
      bottom: 2,
      width: 2,
      height: 2,
      rasterBase64: Buffer.from(bytes).toString('base64'),
    };
    const masks = parseSegmentResponse({ masks: [good, { objectId: 'bad' }] });
    expect(masks).toHaveLength(1);
    expect([...masks[0].raster]).toEqual([0, 1, 1, 0]);
    expect(parseSegmentResponse({})).toEqual([]);
    expect(parseSegmentResponse(null)).toEqual([]);
  });
});

describe('cutout provenance reuse', () => {
  const asset = (id: string, provider: 'local' | 'meta-sam', derivedFrom: string): Asset => ({
    id,
    kind: 'cutout',
    blob: new Blob(),
    createdAt: new Date().toISOString(),
    meta: { derivedFrom, provider },
  });
  it('prefers SAM, falls back to local, and ignores other products', () => {
    const assets = [
      asset('local-1', 'local', 'product-1'),
      asset('sam-1', 'meta-sam', 'product-1'),
      asset('sam-2', 'meta-sam', 'product-2'),
    ];
    expect(findCutoutAsset(assets, 'product-1')?.id).toBe('sam-1');
    expect(findCutoutAsset([assets[0]], 'product-1')?.id).toBe('local-1');
    expect(findCutoutAsset(assets, 'product-9')).toBeNull();
    expect(findCutoutAsset([], 'product-1')).toBeNull();
  });
});

describe('SAM diagnostic errors', () => {
  const segmentBody = async (fetcherBody: unknown) => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(fetcherBody));
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: true, image, prompt: 'product' }),
      { fetcher },
    );
    return { status: response.status, body: await response.json() as { error?: { code?: string; details?: { source?: string; fields?: string[] } } } };
  };

  it('reports sam_no_text when Meta returns no text lane', async () => {
    const empty = await segmentBody({});
    expect(empty.status).toBe(502);
    expect(empty.body.error?.code).toBe('sam_no_text');
    expect(empty.body.error?.details?.source).toBe('meta');
    const wrongLane = await segmentBody({ output: [{ type: 'message', content: [{ type: 'text', text: 'hi' }] }] });
    expect(wrongLane.status).toBe(502);
    expect(wrongLane.body.error?.code).toBe('sam_no_text');
    expect(wrongLane.body.error?.details?.fields).toContain('top:output');
  });

  it('reports sam_no_mask when SAM text parses to zero masks', async () => {
    const plain = await segmentBody(responsesEnvelope('hello, no segmentation here'));
    expect(plain.status).toBe(502);
    expect(plain.body.error?.code).toBe('sam_no_mask');
    expect(plain.body.error?.details?.source).toBe('meta');
  });

  it('maps segment error bodies, preserving well-formed details only', () => {
    const kept = segmentErrorBody({ error: { code: 'sam_no_mask', details: { source: 'meta', message: 'm', fields: ['a'] } } }, 502);
    expect(kept.code).toBe('sam_no_mask');
    expect(kept.details).toEqual({ source: 'meta', message: 'm', fields: ['a'] });
    expect(segmentErrorBody({ error: { code: 'bogus' } }, 502).code).toBe('invalid_response');
    expect(segmentErrorBody(null, 502).code).toBe('invalid_response');
    const dropped = segmentErrorBody({ error: { code: 'timeout', details: { source: 'weird' } } }, 504);
    expect(dropped.code).toBe('timeout');
    expect(dropped.details).toBeUndefined();
  });
});

describe('SAM geometric prompts', () => {
  const segmentWith = async (body: Record<string, unknown>) => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn(async () => Response.json(responsesEnvelope(README_OUTPUT)));
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: true, image, ...body }),
      { fetcher },
    );
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    return { response, sent: JSON.parse(String(init.body)) as { input: { content: { type: string; text?: string }[] }[] } };
  };

  it('sends a box object prompt instead of a noun phrase', async () => {
    const { response, sent } = await segmentWith({ box: { left: 10, top: 20, right: 300, bottom: 320 }, size: { width: 300, height: 330 } });
    expect(response.status).toBe(200);
    const text = sent.input[0].content[0].text ?? '';
    expect(text.startsWith('<0f>1<|box;')).toBe(true);
    expect(text).not.toContain('product');
    expect((await response.json()).masks).toHaveLength(2);
  });

  it('sends a point object prompt for a tap', async () => {
    const { response, sent } = await segmentWith({ point: { x: 150, y: 165 }, size: { width: 300, height: 330 } });
    expect(response.status).toBe(200);
    const text = sent.input[0].content[0].text ?? '';
    expect(text.startsWith('<0f>1<|point;')).toBe(true);
  });

  it('rejects a request combining a noun phrase with a box', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn();
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: true, image, prompt: 'product', box: { left: 0, top: 0, right: 10, bottom: 10 }, size: { width: 300, height: 330 } }),
      { fetcher },
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a box without its image size', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const fetcher = vi.fn();
    const response = await handleSegmentRequest(
      request({ ...base(), imageConsent: true, image, box: { left: 0, top: 0, right: 10, bottom: 10 } }),
      { fetcher },
    );
    expect(response.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('product-box route', () => {
  it('returns the vision bounding box as fractions', async () => {
    const image = { mimeType: 'image/png' as const, data: (await readFile('public/demo/sora-product.png')).toString('base64') };
    const box = { left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 };
    const fetcher = vi.fn(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(box), refusal: null } }] }));
    const response = await handleMetaRoute(
      request({ ...base(), imageConsent: true, image }),
      'product-box',
      { fetcher },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(box);
  });
});
