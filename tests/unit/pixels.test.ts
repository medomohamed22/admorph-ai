import { describe, expect, it } from 'vitest';
import { contrastFromLuminance, luminance, luminanceOfHex, meanLuminance, productBackgroundContrast, textBackgroundContrast, type RgbaImage } from '../../src/lib/critic/pixels';

function solid(width: number, height: number, r: number, g: number, b: number, a = 255): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a; }
  return { width, height, data };
}

describe('pixel contrast review', () => {
  it('matches WCAG black-on-white and reports dark-on-dark as low', () => {
    expect(contrastFromLuminance(luminance(0, 0, 0), luminance(255, 255, 255))).toBeCloseTo(21, 0);
    expect(luminanceOfHex('#ffffff')).toBeCloseTo(1, 2);
    const darkBg = solid(100, 100, 22, 16, 12);
    const darkProduct = solid(100, 100, 22, 16, 12);
    const ratio = productBackgroundContrast(darkBg, darkProduct, { x: 25, y: 25, width: 50, height: 50 });
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeLessThan(1.8);
  });

  it('passes a light product on a dark background', () => {
    const darkBg = solid(100, 100, 22, 16, 12);
    const lightProduct = solid(100, 100, 245, 238, 223);
    const ratio = productBackgroundContrast(darkBg, lightProduct, { x: 25, y: 25, width: 50, height: 50 });
    expect(ratio!).toBeGreaterThan(1.8);
  });

  it('measures text against the background pixels behind it', () => {
    const darkBg = solid(100, 100, 22, 16, 12);
    expect(textBackgroundContrast(darkBg, { x: 0, y: 0, width: 100, height: 20 }, '#16100c')!).toBeLessThan(4.5);
    expect(textBackgroundContrast(darkBg, { x: 0, y: 0, width: 100, height: 20 }, '#ffffff')!).toBeGreaterThan(4.5);
    expect(meanLuminance(darkBg, { x: 200, y: 200, width: 10, height: 10 })).toBeNull();
  });

  it('returns null when the product mask is empty', () => {
    const bg = solid(100, 100, 22, 16, 12);
    const transparent = solid(100, 100, 0, 0, 0, 0);
    expect(productBackgroundContrast(bg, transparent, { x: 25, y: 25, width: 50, height: 50 })).toBeNull();
  });
});
