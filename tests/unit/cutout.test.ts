import { describe, expect, it } from 'vitest';
import {
  applyMask,
  segmentImageData,
  trimBounds,
} from '../../src/lib/cutout/segment';
import { metaSamAvailable } from '../../src/lib/cutout/provider';
import type { Asset } from '../../src/lib/db/schema';

function makeImage(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return data;
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const BLACK: [number, number, number, number] = [0, 0, 0, 255];

describe('local cutout segmentation', () => {
  it('isolates a dark product on a light background and preserves RGB', () => {
    const data = makeImage(100, 100, (x, y) =>
      x >= 30 && x < 70 && y >= 30 && y < 70 ? BLACK : WHITE,
    );
    const result = segmentImageData(data, 100, 100);
    expect(result.reliable).toBe(true);
    expect(result.warnings).toEqual([]);
    // Corners are background; center is product.
    expect(result.mask[0]).toBe(0);
    expect(result.mask[50 * 100 + 50]).toBe(255);
    const cutout = applyMask(data, result.mask);
    // RGB is copied unchanged wherever the mask is opaque.
    const center = (50 * 100 + 50) * 4;
    expect([cutout[center], cutout[center + 1], cutout[center + 2]]).toEqual([0, 0, 0]);
    expect(cutout[center + 3]).toBe(255);
    // Transparent corners keep the background RGB but zero alpha.
    expect(cutout[3]).toBe(0);
  });

  it('keeps an existing alpha channel instead of flood-filling', () => {
    const data = makeImage(40, 40, (x, y) =>
      x >= 10 && x < 30 && y >= 10 && y < 30 ? BLACK : [200, 200, 200, 0],
    );
    const result = segmentImageData(data, 40, 40);
    expect(result.reliable).toBe(true);
    expect(result.mask[0]).toBe(0);
    expect(result.mask[20 * 40 + 20]).toBe(255);
  });

  it('marks a uniform-color photo as unreliable', () => {
    const data = makeImage(30, 30, () => [120, 130, 140, 255]);
    const result = segmentImageData(data, 30, 30);
    expect(result.reliable).toBe(false);
    // The uniform color is estimated as background, so no foreground remains.
    expect(result.warnings).toContain('empty_foreground');
  });

  it('drops stray blobs and keeps only the largest component', () => {
    const data = makeImage(100, 100, (x, y) => {
      const main = x >= 20 && x < 60 && y >= 20 && y < 60;
      const stray = x >= 80 && x < 85 && y >= 80 && y < 85;
      return main || stray ? BLACK : WHITE;
    });
    const result = segmentImageData(data, 100, 100);
    expect(result.mask[50 * 100 + 50]).toBe(255);
    expect(result.mask[82 * 100 + 82]).toBe(0);
  });

  it('feathers a soft edge instead of cutting it hard', () => {
    // Border is uniformly white, so the background estimate is white.
    // A mid-gray column (distance 55 from white, inside the feather band)
    // sits between white background and a black product block.
    const data = makeImage(30, 30, (x) =>
      x < 11 ? WHITE : x === 11 ? [200, 200, 200, 255] : x >= 12 && x < 22 ? BLACK : WHITE,
    );
    const result = segmentImageData(data, 30, 30);
    const edge = result.mask[15 * 30 + 11];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    expect(result.mask[15 * 30 + 17]).toBe(255);
  });

  it('trims transparent margins and reports an empty mask', () => {
    const data = makeImage(50, 50, (x, y) =>
      x >= 10 && x < 20 && y >= 5 && y < 15 ? BLACK : WHITE,
    );
    const result = segmentImageData(data, 50, 50);
    // The 1px blur feather extends the visible bounds by 1px on each side.
    expect(trimBounds(result.mask, 50, 50)).toEqual({ x: 9, y: 4, width: 12, height: 12 });
    const empty = new Uint8ClampedArray(50 * 50);
    expect(trimBounds(empty, 50, 50)).toBeNull();
  });

  it('rejects mismatched image data', () => {
    expect(() => segmentImageData(new Uint8ClampedArray(10), 10, 10)).toThrow('invalid_image_data');
  });
});

describe('cutout storage compatibility', () => {
  it('legacy assets without meta stay valid and cutout assets carry provenance', () => {
    const legacy: Asset = {
      id: crypto.randomUUID(),
      kind: 'product',
      blob: new Blob(),
      createdAt: new Date().toISOString(),
    };
    expect(legacy.meta).toBeUndefined();
    const cutout: Asset = {
      id: crypto.randomUUID(),
      kind: 'cutout',
      blob: new Blob(),
      createdAt: new Date().toISOString(),
      meta: { provider: 'local', sourceWidth: 100, sourceHeight: 100, reliable: true },
    };
    expect(cutout.meta?.provider).toBe('local');
  });

  it('Meta SAM stays unavailable until its task is verified', () => {
    expect(metaSamAvailable).toBe(false);
  });
});
