import { describe, expect, it } from 'vitest';
import { proposeOneshotRepairs } from '../../src/lib/oneshot/repair';
import { contrastFromLuminance, luminanceOfHex } from '../../src/lib/critic/pixels';
import { MOCKUP_SHEET } from '../../src/lib/oneshot/rules';
import type { OneshotCanvasElement } from '../../src/lib/ai/oneshot';

const product = (over: Partial<OneshotCanvasElement> = {}): OneshotCanvasElement => ({ id: 'product', kind: 'product', x: 340, y: 380, width: 400, height: 600, ...over });
const text = (id: string, over: Partial<OneshotCanvasElement> = {}): OneshotCanvasElement => ({ id, kind: 'text', x: 140, y: 120, width: 800, height: 120, text: id, color: '#16100C', ...over });
const logo = (over: Partial<OneshotCanvasElement> = {}): OneshotCanvasElement => ({ id: 'logo', kind: 'logo', x: 830, y: 40, width: 200, height: 80, ...over });
const brand = ['#16100C', '#F5EEDF', '#7ED3E0'];

function intersects(a: OneshotCanvasElement, b: OneshotCanvasElement): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('proposeOneshotRepairs', () => {
  it('moves a text off the product without creating a new overlap', () => {
    const elements = [product(), text('Hello', { x: 140, y: 500 })];
    const proposals = proposeOneshotRepairs(elements, brand);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].elementId).toBe('Hello');
    const moved = { ...elements[1], ...proposals[0].patch };
    expect(intersects(moved, elements[0])).toBe(false);
  });
  it('moves the second text for a text-text overlap', () => {
    const first = text('first', { x: 140, y: 120 });
    const second = text('second', { x: 140, y: 150 });
    const proposals = proposeOneshotRepairs([first, second], brand);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].elementId).toBe('second');
  });
  it('moves the text, never the logo, for a logo overlap', () => {
    const elements = [logo(), text('tag', { x: 850, y: 70, width: 150, height: 60 })];
    const proposals = proposeOneshotRepairs(elements, brand);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].elementId).toBe('tag');
  });
  it('recolors low-contrast text to a brand color that passes 4.5', () => {
    const elements = [text('pale', { color: '#E8E8E8' })];
    const proposals = proposeOneshotRepairs(elements, brand);
    expect(proposals).toHaveLength(1);
    const ratio = contrastFromLuminance(luminanceOfHex(proposals[0].patch.color!), luminanceOfHex(MOCKUP_SHEET));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(brand).toContain(proposals[0].patch.color);
  });
  it('pulls text inside the safe zone', () => {
    const elements = [text('edge', { x: 10, y: 10 })];
    const proposals = proposeOneshotRepairs(elements, brand);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].patch.x).toBe(60);
    expect(proposals[0].patch.y).toBe(60);
  });
  it('returns no proposal when no position fits', () => {
    // Exactly safe-zone-sized, so the only finding is the product overlap
    // and every candidate still overlaps the product.
    const elements = [product(), text('huge', { x: 60, y: 60, width: 960, height: 1230 })];
    const proposals = proposeOneshotRepairs(elements, brand);
    expect(proposals).toHaveLength(0);
  });
  it('returns nothing for a clean layout', () => {
    const elements = [product(), text('Hello', { x: 140, y: 120 })];
    expect(proposeOneshotRepairs(elements, brand)).toHaveLength(0);
  });
});
