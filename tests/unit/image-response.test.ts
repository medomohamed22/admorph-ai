import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { metaImage } from '../../src/lib/ai/meta-transport';

const signal = () => new AbortController().signal;

async function pngFixture() {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#224488' } }).png().toBuffer();
  return { bytes, base64: bytes.toString('base64') };
}

describe('metaImage response handling', () => {
  it('keeps the base64 path working', async () => {
    const { bytes, base64 } = await pngFixture();
    const fetcher = vi.fn(async () => Response.json({ data: [{ b64_json: base64 }] }));
    const result = await metaImage('muse-image-1.0', 'fixture-key', 'a prompt', signal(), { fetcher });
    expect(result.mimeType).toBe('image/png');
    expect(result.bytes.equals(bytes)).toBe(true);
  });

  it('fetches a provider URL server-side and returns only validated bytes', async () => {
    const { bytes, base64 } = await pngFixture();
    const url = 'https://cdn.example.invalid/render.png';
    const fetcher = vi.fn()
      .mockImplementationOnce(async () => Response.json({ data: [{ url }] }))
      .mockImplementationOnce(async () => new Response(bytes, { headers: { 'Content-Type': 'image/png' } }));
    const result = await metaImage('muse-image-1.0', 'fixture-key', 'a prompt', signal(), { fetcher }, { mimeType: 'image/png', data: base64 });
    expect(result.mimeType).toBe('image/png');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe(url);
  });

  it('reports an unknown envelope shape instead of a generic image error', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ output_url: 'https://cdn.example.invalid/x.png' }] }));
    await expect(metaImage('muse-image-1.0', 'fixture-key', 'a prompt', signal(), { fetcher }))
      .rejects.toMatchObject({ code: 'image_shape', details: { source: 'meta', fields: expect.arrayContaining(['item:output_url']) } });
  });

  it('refuses non-https and private URLs without fetching them', async () => {
    for (const url of ['http://cdn.example.invalid/x.png', 'https://localhost:9999/x.png', 'https://192.168.1.10/x.png']) {
      const fetcher = vi.fn(async () => Response.json({ data: [{ url }] }));
      await expect(metaImage('muse-image-1.0', 'fixture-key', 'a prompt', signal(), { fetcher }))
        .rejects.toMatchObject({ code: 'image_response' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps malformed base64 as a plain image error', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [{ b64_json: '!!!not-base64!!!' }] }));
    await expect(metaImage('muse-image-1.0', 'fixture-key', 'a prompt', signal(), { fetcher }))
      .rejects.toMatchObject({ code: 'image_response' });
  });
});

import { fitImageResponse } from '../../src/lib/ai/meta-transport';

describe('oversized painted images', () => {
  // Random noise does not compress: a 1100x1100 noise PNG is about 3.6 MB, like a large Muse Image result.
  async function noisyPng(size = 1100) {
    const raw = Buffer.alloc(size * size * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
    return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  }
  it('passes a small image through untouched', async () => {
    const { bytes } = await pngFixture();
    expect(await fitImageResponse(bytes, 'png')).toEqual({ bytes, mimeType: 'image/png' });
  });
  it('re-encodes an image over the response cap instead of refusing it', async () => {
    const big = await noisyPng();
    expect(big.length).toBeGreaterThan(3 * 1024 * 1024);
    const fitted = await fitImageResponse(big, 'png');
    expect(fitted.bytes.length).toBeLessThanOrEqual(3 * 1024 * 1024);
    const meta = await sharp(fitted.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1100, 1100]);
  });
  it('metaImage accepts a painted PNG over 3 MB', async () => {
    const big = await noisyPng();
    const fetcher = vi.fn(async () => Response.json({ data: [{ b64_json: big.toString('base64') }] }));
    const result = await metaImage('muse-image-1.0', 'fixture-key', 'a prompt', signal(), { fetcher });
    expect(result.bytes.length).toBeLessThanOrEqual(3 * 1024 * 1024);
  });
});
