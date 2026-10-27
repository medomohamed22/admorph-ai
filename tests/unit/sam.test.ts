import { describe, expect, it } from 'vitest';
import {
  applySamAlpha,
  maskToAlpha,
  parseSamMasks,
  pickLargestMask,
  type SamMask,
} from '../../src/lib/cutout/sam';

// Example output_text from the official @meta-sam/parser README: frame 0 of
// a 320x334 clip, prompt "button", two objects. Public documentation data,
// used here as a parsing fixture only.
const README_OUTPUT =
  '<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>' +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ',1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>' +
  '<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n';

describe('SAM mask parsing', () => {
  it('parses the documented example into two masks with bounds and rasters', async () => {
    const { masks } = await parseSamMasks(README_OUTPUT);
    expect(masks).toHaveLength(2);
    const first = masks.find((mask) => mask.objectId === '0')!;
    expect([first.left, first.top, first.right, first.bottom]).toEqual([211, 228, 271, 255]);
    expect([first.width, first.height]).toEqual([60, 27]);
    expect(first.raster.length).toBe(60 * 27);
    expect(first.raster.some((value) => value === 1)).toBe(true);
    const second = masks.find((mask) => mask.objectId === '1')!;
    expect([second.width, second.height]).toEqual([48, 27]);
    expect(second.raster.length).toBe(48 * 27);
  });

  it('returns no masks for plain text', async () => {
    const { masks } = await parseSamMasks('hello, no segmentation here');
    expect(masks).toEqual([]);
  });

  it('picks the largest mask by filled pixels', () => {
    const small: SamMask = {
      objectId: 'a',
      left: 0,
      top: 0,
      right: 2,
      bottom: 2,
      width: 2,
      height: 2,
      raster: new Uint8Array([1, 0, 0, 0]),
    };
    const big: SamMask = {
      objectId: 'b',
      left: 0,
      top: 0,
      right: 2,
      bottom: 2,
      width: 2,
      height: 2,
      raster: new Uint8Array([1, 1, 1, 0]),
    };
    expect(pickLargestMask([small, big])?.objectId).toBe('b');
    expect(pickLargestMask([])).toBeNull();
  });
});

describe('mask to alpha', () => {
  it('upscales a raster onto its bounds, feathers the edge, keeps RGB untouched', () => {
    const mask: SamMask = {
      objectId: 'p',
      left: 2,
      top: 2,
      right: 6,
      bottom: 6,
      width: 4,
      height: 4,
      raster: new Uint8Array(16).fill(1),
    };
    const alpha = maskToAlpha(mask, 8, 8);
    // Far outside stays transparent, deep interior stays opaque, the edge
    // is softened by the blur (neither 0 nor 255).
    expect(alpha[0]).toBe(0);
    expect(alpha[3 * 8 + 3]).toBe(255);
    const edge = alpha[2 * 8 + 2];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const out = applySamAlpha(rgba, new Uint8ClampedArray([0, 128]));
    expect([...out]).toEqual([10, 20, 30, 0, 40, 50, 60, 128]);
  });
});
