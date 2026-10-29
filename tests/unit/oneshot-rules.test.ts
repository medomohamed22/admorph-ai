import { describe, expect, it } from 'vitest';
import { inspectOneshotLayout } from '../../src/lib/oneshot/rules';
import type { OneshotCanvasElement } from '../../src/lib/ai/oneshot';

const product: OneshotCanvasElement = { id: 'product', kind: 'product', x: 340, y: 380, width: 400, height: 600 };
const headline: OneshotCanvasElement = { id: 'headline', kind: 'text', x: 140, y: 120, width: 800, height: 120, text: 'Sale' };

describe('inspectOneshotLayout', () => {
  it('reports nothing for a clean arrangement', () => {
    expect(inspectOneshotLayout([product, headline])).toEqual([]);
  });
  it('flags text overlapping the product as an error', () => {
    const overlapping: OneshotCanvasElement = { id: 't1', kind: 'text', x: 140, y: 500, width: 800, height: 120, text: 'Hello' };
    const findings = inspectOneshotLayout([product, headline, overlapping]);
    expect(findings).toHaveLength(1);
    expect(findings[0].code).toBe('overlap_product');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].elementIds).toEqual(['t1', 'product']);
  });
  it('flags two overlapping texts and a logo over text', () => {
    const a: OneshotCanvasElement = { id: 'a', kind: 'text', x: 100, y: 100, width: 300, height: 100, text: 'A' };
    const b: OneshotCanvasElement = { id: 'b', kind: 'text', x: 200, y: 150, width: 300, height: 100, text: 'B' };
    const logo: OneshotCanvasElement = { id: 'logo', kind: 'logo', x: 150, y: 120, width: 200, height: 80 };
    const codes = inspectOneshotLayout([a, b, logo]).map(item => item.code);
    expect(codes).toContain('overlap_text');
    expect(codes).toContain('overlap_logo');
  });
  it('flags light text on the mockup sheet and text near the edge', () => {
    const faint: OneshotCanvasElement = { id: 'faint', kind: 'text', x: 200, y: 500, width: 400, height: 100, text: 'Soft', color: '#F5EEDF' };
    const edge: OneshotCanvasElement = { id: 'edge', kind: 'text', x: 10, y: 500, width: 200, height: 100, text: 'Edge' };
    const findings = inspectOneshotLayout([faint, edge]);
    const contrast = findings.find(item => item.code === 'low_contrast');
    expect(contrast).toBeDefined();
    expect(Number(contrast!.detail)).toBeLessThan(4.5);
    const safe = findings.find(item => item.code === 'outside_safe_zone');
    expect(safe?.detail).toBe('10px');
  });
  it('ignores blank text boxes entirely', () => {
    const blank: OneshotCanvasElement = { id: 'blank', kind: 'text', x: 340, y: 380, width: 400, height: 600, text: '' };
    expect(inspectOneshotLayout([product, blank])).toEqual([]);
  });
});
