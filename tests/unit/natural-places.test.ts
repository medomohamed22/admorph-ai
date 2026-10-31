import { describe, it, expect } from 'vitest';
import { artBriefInstruction, NATURAL_PLACE_RULE, VARIANT_AXES } from '../../src/lib/ai/art-brief';
import { LOOK_LIBRARY, pickLooks } from '../../src/lib/ai/looks';

const seeded = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('places that fit the product', () => {
  it('asks the planner to recognize the product and use places where it is naturally used', () => {
    const text = artBriefInstruction([]);
    expect(text).toContain(NATURAL_PLACE_RULE);
    expect(NATURAL_PLACE_RULE).toContain('home fragrance in a living room, a bedroom or a bathroom');
    expect(text).toContain('three different such places');
    expect(text).toContain('If the written brief names a place');
  });
  it('lets a typed place win for all three ideas, without the recent-place list', () => {
    const text = artBriefInstruction(['a beach'], { place: 'a rooftop café' });
    expect(text).toContain('"a rooftop café"');
    expect(text).toContain('Set all three concepts there');
    expect(text).not.toContain(NATURAL_PLACE_RULE);
    expect(text).not.toContain('Recent ads');
    expect(artBriefInstruction(['a beach'])).toContain('"a beach"');
  });
  it('gives each idea its own light and mood when looks are sent', () => {
    expect(artBriefInstruction([], { looks: ['one', 'two'] })).toContain('(1) one (2) two');
    expect(artBriefInstruction([])).not.toContain('Light and mood for each concept');
  });
  it('moves variants to another natural place', () => {
    expect(VARIANT_AXES.find(axis => axis.id === 'setting')?.instruction).toContain('naturally used');
  });
});

describe('look library', () => {
  it('is large and picks without repeats', () => {
    expect(LOOK_LIBRARY.length).toBeGreaterThanOrEqual(30);
    expect(new Set(LOOK_LIBRARY).size).toBe(LOOK_LIBRARY.length);
    const picked = pickLooks(3, seeded(5));
    expect(new Set(picked).size).toBe(3);
    for (const look of picked) { expect(LOOK_LIBRARY).toContain(look); expect(look.length).toBeLessThanOrEqual(120); }
  });
  it('varies between runs', () => {
    const rounds = new Set(Array.from({ length: 10 }, (_, index) => pickLooks(3, seeded(index + 2)).join('|')));
    expect(rounds.size).toBeGreaterThan(5);
  });
});
