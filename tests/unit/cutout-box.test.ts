import { describe, expect, it } from 'vitest';
import { boxFractionsToPixels, pointFractionsToPixels } from '../../src/lib/cutout/sam-client';

describe('geometric cutout coordinates', () => {
  it('converts fractions to a half-open pixel box', () => {
    expect(boxFractionsToPixels({ left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 }, 1000, 500)).toEqual({ left: 100, top: 100, right: 900, bottom: 400 });
  });

  it('clamps a box that spills outside the image', () => {
    expect(boxFractionsToPixels({ left: -0.1, top: 0, right: 1.2, bottom: 1 }, 300, 330)).toEqual({ left: 0, top: 0, right: 300, bottom: 330 });
  });

  it('never returns an empty box for a degenerate fraction box', () => {
    expect(boxFractionsToPixels({ left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 }, 300, 330)).toEqual({ left: 150, top: 165, right: 151, bottom: 166 });
  });

  it('clamps a tap point inside the image', () => {
    expect(pointFractionsToPixels({ x: 0.5, y: 0.5 }, 300, 330)).toEqual({ x: 150, y: 165 });
    expect(pointFractionsToPixels({ x: 1.4, y: -0.2 }, 300, 330)).toEqual({ x: 299, y: 0 });
  });
});

import { padBoxFractions, clippedSides, BOX_PAD } from '../../src/lib/cutout/sam-client';

describe('tight vision boxes', () => {
  it('grows the box by a share of its own size and stays inside the image', () => {
    const padded = padBoxFractions({ left: 0.2, top: 0.2, right: 0.6, bottom: 0.8 }, BOX_PAD);
    expect(padded.left).toBeCloseTo(0.18); expect(padded.right).toBeCloseTo(0.62);
    expect(padded.top).toBeCloseTo(0.17); expect(padded.bottom).toBeCloseTo(0.83);
    expect(padBoxFractions({ left: 0, top: 0.01, right: 1, bottom: 0.99 }, 0.2)).toEqual({ left: 0, top: 0, right: 1, bottom: 1 });
  });
  it('flags a mask that runs into the box edge, but not into the image border', () => {
    const width = 20, height = 20, alpha = new Uint8ClampedArray(width * height);
    // Mask fills x 5..14, y 2..17; the box is x 5..15, y 0..20 (top and bottom on the image border).
    for (let y = 2; y < 18; y++) for (let x = 5; x < 15; x++) alpha[y * width + x] = 255;
    expect(clippedSides(alpha, width, height, { left: 5, top: 0, right: 15, bottom: 20 })).toEqual(['left', 'right']);
    // With room around it, the same mask is whole.
    expect(clippedSides(alpha, width, height, { left: 3, top: 0, right: 17, bottom: 20 })).toEqual([]);
    // A mask touching the box edge at one point (a rounded corner) is not a clip.
    const dot = new Uint8ClampedArray(width * height); dot[10 * width + 3] = 255;
    expect(clippedSides(dot, width, height, { left: 3, top: 1, right: 17, bottom: 19 })).toEqual([]);
  });
});

import { dropSmallIslands } from '../../src/lib/cutout/sam-client';

describe('detached mask fragments', () => {
  it('clears small pieces that do not touch the product and keeps large parts', () => {
    const width = 30, height = 20, alpha = new Uint8ClampedArray(width * height);
    const fill = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * width + x] = 255; };
    fill(2, 2, 12, 14);   // the product: 120 px
    fill(14, 2, 24, 12);  // a second large part: 100 px (kept)
    fill(4, 16, 7, 18);   // a price-tag fragment: 6 px (cleared)
    expect(dropSmallIslands(alpha, width, height)).toBe(6);
    expect(alpha[17 * width + 5]).toBe(0);
    expect(alpha[5 * width + 5]).toBe(255);
    expect(alpha[5 * width + 20]).toBe(255);
  });
  it('leaves a single-piece mask alone', () => {
    const alpha = new Uint8ClampedArray(16).fill(255);
    expect(dropSmallIslands(alpha, 4, 4)).toBe(0);
  });
});

import { chooseBoxAlpha, perimeterCoverage } from '../../src/lib/cutout/sam-client';

describe('box masks: product, not background', () => {
  const width = 20, height = 20, box = { left: 2, top: 2, right: 18, bottom: 18 };
  const product = new Uint8ClampedArray(width * height), background = new Uint8ClampedArray(width * height);
  for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) {
    const inside = x >= 6 && x < 14 && y >= 6 && y < 14;
    (inside ? product : background)[y * width + x] = 255;
  }
  it('measures how much of the box outline a mask covers', () => {
    expect(perimeterCoverage(product, width, height, box)).toBe(0);
    expect(perimeterCoverage(background, width, height, box)).toBe(1);
  });
  it('prefers the product over a larger background mask', () => {
    expect(chooseBoxAlpha([background, product], width, height, box)).toBe(product);
  });
  it('inverts a lone background mask inside the box', () => {
    const chosen = chooseBoxAlpha([background], width, height, box)!;
    expect(chosen[10 * width + 10]).toBe(255);
    expect(chosen[3 * width + 3]).toBe(0);
    expect(chosen[0]).toBe(0);
  });
  it('never treats a product that fills a full-image box as background', () => {
    const full = new Uint8ClampedArray(width * height).fill(255);
    expect(chooseBoxAlpha([full], width, height, { left: 0, top: 0, right: width, bottom: height })).toBe(full);
  });
});

import { isBackgroundMask } from '../../src/lib/cutout/sam-client';

describe('a product larger than its box is not mistaken for background', () => {
  const width = 20, height = 20, box = { left: 2, top: 2, right: 18, bottom: 18 };
  it('keeps a mask that fills the whole box', () => {
    const solid = new Uint8ClampedArray(width * height);
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) solid[y * width + x] = 255;
    expect(isBackgroundMask(solid, width, height, box)).toBe(false);
    expect(chooseBoxAlpha([solid], width, height, box)).toBe(solid);
  });
  it('keeps a round product whose uncovered corners touch the outline', () => {
    const round = new Uint8ClampedArray(width * height);
    for (let y = 2; y < 18; y++) for (let x = 2; x < 18; x++) if ((x - 9.5) ** 2 + (y - 9.5) ** 2 <= 64) round[y * width + x] = 255;
    expect(isBackgroundMask(round, width, height, box)).toBe(false);
  });
});

import { tightenEdge, edgeRadius } from '../../src/lib/cutout/sam-client';

describe('cutout edge', () => {
  it('pulls the edge in by the radius and softens the new edge', () => {
    const width = 20, height = 20, alpha = new Uint8ClampedArray(width * height);
    for (let y = 4; y < 16; y++) for (let x = 4; x < 16; x++) alpha[y * width + x] = 255;
    tightenEdge(alpha, width, height, 2);
    expect(alpha[10 * width + 10]).toBe(255);   // deep inside: untouched
    expect(alpha[10 * width + 3]).toBe(0);
    expect(alpha[10 * width + 4]).toBe(0);      // the old edge strip is gone
    expect(alpha[10 * width + 5]).toBeGreaterThan(0); // the new edge is soft, not hard
    expect(alpha[10 * width + 5]).toBeLessThan(255);
    expect(alpha[10 * width + 7]).toBe(255);
  });
  it('sets the radius from how far the mask was scaled up', () => {
    const mask = (boxWidth: number, maskWidth: number) => ({ objectId: 'p', left: 0, top: 0, right: boxWidth, bottom: boxWidth, width: maskWidth, height: maskWidth, raster: new Uint8Array(0) });
    expect(edgeRadius([mask(300, 300)])).toBe(1);
    expect(edgeRadius([mask(1200, 300)])).toBe(2);
    expect(edgeRadius([mask(4000, 256)])).toBe(4);
  });
});
