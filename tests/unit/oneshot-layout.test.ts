import { describe, expect, it } from 'vitest';
import {
  clampOneshotElement, toServerLayout, initialOneshotLayout, zoneOf, scaleOneshotElement,
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
  it('drops blobs, colors, font sizes and fonts but keeps text', () => {
    const blob = new Blob(['x']);
    const layout = toServerLayout([
      { id: 'p', kind: 'product', x: 0, y: 0, width: 100, height: 100, blob },
      { id: 'h', kind: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hi', color: '#000', fontSize: 40, fontFamily: 'Montserrat' },
    ] as OneshotCanvasElement[]);
    expect(layout).toEqual([
      { id: 'p', kind: 'product', x: 0, y: 0, width: 100, height: 100 },
      { id: 'h', kind: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hi' },
    ]);
  });
});

describe('scaleOneshotElement', () => {
  it('scales around the center', () => {
    expect(scaleOneshotElement({ id: 't', kind: 'text', x: 140, y: 500, width: 800, height: 120, text: 'hi' }, 1.2)).toEqual(
      { id: 't', kind: 'text', x: 60, y: 488, width: 960, height: 144, text: 'hi' });
  });
  it('never shrinks below the 24px minimum', () => {
    expect(scaleOneshotElement({ id: 't', kind: 'text', x: 100, y: 100, width: 30, height: 30, text: 'hi' }, 0.5)).toEqual(
      { id: 't', kind: 'text', x: 103, y: 103, width: 24, height: 24, text: 'hi' });
  });
  it('never grows past the frame edges', () => {
    expect(scaleOneshotElement({ id: 't', kind: 'text', x: 0, y: 0, width: 1000, height: 1200, text: 'hi' }, 1.2)).toEqual(
      { id: 't', kind: 'text', x: 0, y: 0, width: 1080, height: 1296, text: 'hi' });
  });
  it('keeps canvas-only fields on the scaled element', () => {
    const blob = new Blob(['x']);
    const scaled = scaleOneshotElement({ id: 't', kind: 'text', x: 0, y: 0, width: 100, height: 100, text: 'hi', blob, color: '#000', fontFamily: 'Montserrat' }, 2);
    expect(scaled.blob).toBe(blob);
    expect(scaled.color).toBe('#000');
    expect(scaled.fontFamily).toBe('Montserrat');
    expect(scaled.width).toBe(200);
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
