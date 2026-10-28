import { describe, expect, it } from 'vitest';
import {
  clampOneshotElement, toServerLayout, initialOneshotLayout, zoneOf,
  type OneshotCanvasElement,
} from '../../src/lib/ai/oneshot';

describe('clampOneshotElement', () => {
  it('keeps boxes inside the frame and enforces the 24px minimum', () => {
    expect(clampOneshotElement({ id: 'a', kind: 'text', x: -50, y: 1400, width: 10, height: 2000 })).toEqual(
      { id: 'a', kind: 'text', x: 0, y: 0, width: 24, height: 1350 });
    expect(clampOneshotElement({ id: 'b', kind: 'logo', x: 1000, y: 100, width: 200, height: 80 })).toEqual(
      { id: 'b', kind: 'logo', x: 880, y: 100, width: 200, height: 80 });
  });
});

describe('toServerLayout', () => {
  it('drops blobs, colors and font sizes but keeps text', () => {
    const blob = new Blob(['x']);
    const layout = toServerLayout([
      { id: 'p', kind: 'product', x: 0, y: 0, width: 100, height: 100, blob },
      { id: 'h', kind: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hi', color: '#000', fontSize: 40 },
    ] as OneshotCanvasElement[]);
    expect(layout).toEqual([
      { id: 'p', kind: 'product', x: 0, y: 0, width: 100, height: 100 },
      { id: 'h', kind: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hi' },
    ]);
  });
});

describe('initialOneshotLayout', () => {
  it('centers the product, puts the headline on top, and the logo top-right', () => {
    const layout = initialOneshotLayout(true);
    expect(layout.find(item => item.kind === 'product')?.id).toBe('product');
    expect(zoneOf(layout.find(item => item.kind === 'product')!)).toBe('center');
    expect(zoneOf(layout.find(item => item.kind === 'text')!)).toBe('top');
    expect(zoneOf(layout.find(item => item.kind === 'logo')!)).toBe('top right');
    expect(initialOneshotLayout(false).some(item => item.kind === 'logo')).toBe(false);
  });
});
