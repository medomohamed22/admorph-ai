import { describe, expect, it } from 'vitest';
import { snapBox, alignToFrame, moveLayer } from '../../src/lib/oneshot/snap';
import { clearEdgeBackground } from '../../src/lib/oneshot/logo-background';
import { iconSvg, textOn, ICONS } from '../../src/lib/oneshot/icons';
import { buildOneshotPrompt, toServerLayout, oneshotElementSchema, type OneshotCanvasElement } from '../../src/lib/ai/oneshot';
import { inspectOneshotLayout } from '../../src/lib/oneshot/rules';

const brand = { name: 'Sora', description: 'tea', colors: ['#52633C', '#DCE5BB', '#F2D1BC'] as [string, string, string] };

describe('snapping', () => {
  it('snaps a box centre to the frame centre and reports the guide', () => {
    const snapped = snapBox({ x: 335, y: 700, width: 400, height: 100 }, [], 10);
    expect(snapped.x).toBe(340);
    expect(snapped.guides).toContainEqual({ axis: 'x', at: 540 });
  });
  it('snaps an edge to another element edge, and leaves far boxes alone', () => {
    const other = { x: 100, y: 100, width: 200, height: 200 };
    expect(snapBox({ x: 306, y: 500, width: 100, height: 50 }, [other], 10).x).toBe(300);
    const free = snapBox({ x: 420, y: 520, width: 50, height: 50 }, [other], 10);
    expect(free).toEqual({ x: 420, y: 520, guides: [] });
  });
  it('aligns to the frame and reorders layers', () => {
    const box = { x: 100, y: 100, width: 200, height: 100 };
    expect(alignToFrame(box, 'center')).toEqual({ x: 440, y: 100 });
    expect(alignToFrame(box, 'bottom')).toEqual({ x: 100, y: 1250 });
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(moveLayer(items, 'a', 'up').map(item => item.id)).toEqual(['b', 'a', 'c']);
    expect(moveLayer(items, 'c', 'up')).toBe(items);
    expect(moveLayer(items, 'a', 'down')).toBe(items);
  });
});

describe('logo background', () => {
  const image = (width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(paint(x, y), (y * width + x) * 4);
    return data;
  };
  it('clears a white background connected to the edges but keeps a white counter inside the mark', () => {
    // A black ring (2..7) with a white hole (4..5) on white.
    const data = image(10, 10, (x, y) => {
      const ring = x >= 2 && x <= 7 && y >= 2 && y <= 7, hole = x >= 4 && x <= 5 && y >= 4 && y <= 5;
      return ring && !hole ? [0, 0, 0, 255] : [255, 255, 255, 255];
    });
    const result = clearEdgeBackground(data, 10, 10);
    expect(result.cleared).toBe(100 - 36);
    expect(data[3]).toBe(0);
    expect(data[(4 * 10 + 4) * 4 + 3]).toBe(255);
    expect(data[(2 * 10 + 2) * 4 + 3]).toBe(255);
  });
  it('refuses a busy background and skips a transparent one', () => {
    const busy = image(4, 4, x => x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]);
    expect(clearEdgeBackground(busy, 4, 4).reason).toBe('busy_background');
    const clear = image(4, 4, () => [0, 0, 0, 0]);
    expect(clearEdgeBackground(clear, 4, 4).reason).toBe('already_transparent');
  });
});

describe('icons and badges', () => {
  it('draws every icon in one safe color', () => {
    expect(ICONS).toHaveLength(12);
    expect(iconSvg('star', '#ff0000')).toContain('fill="#ff0000"');
    expect(iconSvg('star', 'red;x')).toContain('fill="#16100C"');
  });
  it('picks readable badge text', () => {
    expect(textOn('#16100C')).toBe('#FFFFFF');
    expect(textOn('#F5D76E')).toBe('#16100C');
  });
  it('sends the badge kind to the server but never the canvas-only style', () => {
    const element: OneshotCanvasElement = { id: 'b', kind: 'text', x: 600, y: 1000, width: 300, height: 120, text: '45 EGP', badge: 'price', fill: '#52633C', color: '#FFFFFF', bold: true, align: 'left', fontSize: 50 };
    const [server] = toServerLayout([element]);
    expect(server).toEqual({ id: 'b', kind: 'text', x: 600, y: 1000, width: 300, height: 120, text: '45 EGP', badge: 'price' });
    expect(oneshotElementSchema.safeParse(server).success).toBe(true);
    expect(oneshotElementSchema.safeParse({ ...server, badge: 'ribbon' }).success).toBe(false);
    const prompt = buildOneshotPrompt(brand, 'a cafe', [server], 'en');
    expect(prompt).toContain('The text "45 EGP" sits on a solid rounded price tag bottom right');
  });
  it('measures badge text contrast against the badge, not the sheet', () => {
    const white = { id: 'w', kind: 'text' as const, x: 200, y: 200, width: 300, height: 120, text: 'Sale', color: '#FFFFFF' };
    expect(inspectOneshotLayout([white]).some(item => item.code === 'low_contrast')).toBe(true);
    expect(inspectOneshotLayout([{ ...white, badge: 'cta', fill: '#16100C' }]).some(item => item.code === 'low_contrast')).toBe(false);
  });
});
