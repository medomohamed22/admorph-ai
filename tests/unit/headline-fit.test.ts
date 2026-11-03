import { describe, expect, it } from 'vitest';
import { fitFontSize, wrappedLines } from '../../src/lib/editor/text-fit';
import { HEADLINE_HOOK_RULE, HOOK_STYLES, ideaHeadlineRule, pickHookStyles } from '../../src/lib/ai/copy-rules';

// Each character is 0.55 of the font size wide: close to Inter.
const measure = (text: string, size: number) => text.length * size * 0.55;

describe('headline fit on the mockup', () => {
  it('keeps the set size when the headline already fits', () => {
    expect(fitFontSize('Cold all day', { width: 800, height: 120 }, { preferred: 64, padding: 8, lineHeight: 1.2 }, measure)).toBe(64);
  });
  it('shrinks a long headline until every word fits the box, so no word is cut off', () => {
    const text = '24 hours of ice-cold in one bottle';
    const size = fitFontSize(text, { width: 800, height: 120 }, { preferred: 64, padding: 8, lineHeight: 1.2 }, measure);
    expect(size).toBeLessThan(64);
    expect(wrappedLines(text, 784, size, measure) * size * 1.2).toBeLessThanOrEqual(104);
  });
  it('never goes below the floor and leaves empty text alone', () => {
    expect(fitFontSize('word '.repeat(80), { width: 200, height: 60 }, { preferred: 64, padding: 8, lineHeight: 1.2, min: 20 }, measure)).toBe(20);
    expect(fitFontSize('', { width: 800, height: 120 }, { preferred: 64, padding: 8, lineHeight: 1.2 }, measure)).toBe(64);
  });
});

describe('idea headlines', () => {
  it('asks for three or four words about this product, in the dialect, with a hook style per idea', () => {
    const rule = ideaHeadlineRule(['offer', 'benefit', 'lifestyle'], ['a short, friendly command', 'a contrast: this, not that', 'a warm compliment to the customer'], 'Egyptian Arabic');
    expect(rule).toContain('three or four words, never more than five');
    expect(rule).toContain('this exact product');
    expect(rule).toContain('Egyptian Arabic');
    expect(rule).toContain('the lifestyle idea uses a warm compliment to the customer');
  });
  it('picks different hook styles each time, never the same style twice in one round', () => {
    const first = pickHookStyles(3, () => 0), second = pickHookStyles(3, () => 0.99);
    expect(new Set(first).size).toBe(3);
    expect(first).not.toEqual(second);
    for (const style of [...first, ...second]) expect(HOOK_STYLES).toContain(style);
  });
  it('forbids invented numbers in headlines', () => {
    expect(HEADLINE_HOOK_RULE).toContain('Never put a number, duration, percentage or price in a headline');
    expect(HEADLINE_HOOK_RULE).not.toContain('a short question, a number');
  });
});
