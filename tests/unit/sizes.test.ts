import { describe, expect, it } from 'vitest';
import { dimensionsFor, formatLabel, SIZE_FORMATS } from '../../src/lib/editor/sizes';

describe('platform sizes', () => {
  it('maps formats to dimensions and defaults old records to 4:5', () => {
    expect(dimensionsFor('1080x1350')).toEqual({ width: 1080, height: 1350 });
    expect(dimensionsFor('1080x1080')).toEqual({ width: 1080, height: 1080 });
    expect(dimensionsFor('1080x1920')).toEqual({ width: 1080, height: 1920 });
    expect(dimensionsFor(undefined)).toEqual({ width: 1080, height: 1350 });
    expect(dimensionsFor(null)).toEqual({ width: 1080, height: 1350 });
    expect(formatLabel('1080x1080')).toBe('1080 × 1080 · 1:1');
    expect(SIZE_FORMATS).toEqual(['1080x1350', '1080x1080', '1080x1920']);
  });
});
