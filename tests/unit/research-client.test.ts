import { describe, it, expect } from 'vitest';
import { pickTrends, pickStyles, researchBrief, sourceHost, STYLE_LIBRARY } from '../../src/lib/ai/research-picks';

const trend = (name: string, size = 60) => ({ name, visual: 'v'.repeat(size), copy: 'c'.repeat(Math.round(size / 2)) });
const five = ['A', 'B', 'C', 'D', 'E'].map(name => trend(name));
const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('choosing directions', () => {
  it('takes unused directions first, then used ones', () => {
    const picked = pickTrends(five, 4, ['A', 'B', 'C'], seeded(3)).map(item => item.name);
    expect(picked.slice(0, 2).sort()).toEqual(['D', 'E']);
    expect(picked).toHaveLength(4);
    expect(pickTrends(five, 9).length).toBe(5);
    expect(pickTrends(five, 0)).toEqual([]);
  });
  it('varies the order between runs', () => {
    const orders = new Set(Array.from({ length: 12 }, (_, index) => pickTrends(five, 3, [], seeded(index + 7)).map(item => item.name).join('')));
    expect(orders.size).toBeGreaterThan(3);
  });
  it('draws library looks without repeats', () => {
    const styles = pickStyles(3, seeded(11));
    expect(new Set(styles).size).toBe(3);
    for (const style of styles) expect(STYLE_LIBRARY).toContain(style);
    expect(STYLE_LIBRARY.length).toBeGreaterThanOrEqual(30);
  });
});

describe('the planner brief', () => {
  it('keeps the user\'s own words first and fits 2000 characters', () => {
    const brief = researchBrief('Make it feel like Ramadan nights', five.slice(0, 3), ['a look']);
    expect(brief.startsWith('Make it feel like Ramadan nights')).toBe(true);
    expect(brief).toContain('(1) ');
    expect(brief).toContain('never copy a brand');
    expect(brief).toContain('Fresh looks to consider: a look.');
  });
  it('drops research directions, never the user text, when too long', () => {
    const long = ['A', 'B', 'C'].map(name => trend(name, 900));
    const own = 'x'.repeat(480);
    const brief = researchBrief(own, long, [], 2000);
    expect(brief.length).toBeLessThanOrEqual(2000);
    expect(brief.startsWith(own)).toBe(true);
    expect(researchBrief('', long, [], 700).length).toBeLessThanOrEqual(700);
  });
  it('is just the library looks without research, and empty with nothing at all', () => {
    expect(researchBrief('', [], ['one', 'two'])).toBe('Fresh looks to consider: one; two.');
    expect(researchBrief('', [], [])).toBe('');
  });
});

it('shows a short host for a source link', () => {
  expect(sourceHost('https://www.behance.net/gallery/1')).toBe('behance.net');
  expect(sourceHost('not a url')).toBe('not a url');
});
