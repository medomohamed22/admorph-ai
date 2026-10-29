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
