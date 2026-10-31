import { describe, it, expect } from 'vitest';
import { DEMO_STEPS, DEMO_IDLE, parseDemoState, isFinished, pageUrl, demoBrand, demoShelfBrand } from '../../src/lib/demo/tour';
import en from '../../src/messages/studio.en.json';
import ar from '../../src/messages/studio.ar.json';

describe('guided demo', () => {
  it('walks one-shot, then the seasons page, then the shelf', () => {
    expect(DEMO_STEPS.map(step => step.page)).toEqual(['oneshot', 'oneshot', 'oneshot', 'oneshot', 'oneshot', 'themes', 'shelf', 'shelf']);
    expect(new Set(DEMO_STEPS.map(step => step.id)).size).toBe(DEMO_STEPS.length);
  });
  it('has copy for every step in both languages', () => {
    for (const step of DEMO_STEPS) {
      expect(en.demo.steps[step.id].title.length).toBeGreaterThan(0);
      expect(ar.demo.steps[step.id].body.length).toBeGreaterThan(0);
    }
    expect(Object.keys(ar.demo).sort()).toEqual(Object.keys(en.demo).sort());
  });
  it('restores a stored run safely', () => {
    expect(parseDemoState(null)).toEqual(DEMO_IDLE);
    expect(parseDemoState('not json')).toEqual(DEMO_IDLE);
    expect(parseDemoState('{"index":3}')).toEqual(DEMO_IDLE);
    // A step that was running when the page reloaded starts again.
    const restored = parseDemoState(JSON.stringify({ ...DEMO_IDLE, active: true, index: 4, status: 'running', mode: 'step' }));
    expect(restored).toMatchObject({ active: true, index: 4, status: 'pending', mode: 'step' });
    expect(parseDemoState(JSON.stringify({ ...DEMO_IDLE, active: true, index: 99 })).index).toBe(DEMO_STEPS.length);
    expect(isFinished({ ...DEMO_IDLE, active: true, index: DEMO_STEPS.length })).toBe(true);
  });
  it('opens the seasons page on the ad the tour just made', () => {
    expect(pageUrl('themes', { adId: 'a b' })).toBe('/themes?ad=a%20b');
    expect(pageUrl('shelf', {})).toBe('/shelf');
  });
  it('uses complete brands with valid colors', () => {
    for (const brand of [demoBrand('en'), demoBrand('ar'), demoShelfBrand('en'), demoShelfBrand('ar')]) {
      expect(brand.name.trim()).not.toBe('');
      expect(brand.description.trim()).not.toBe('');
      for (const color of brand.colors) expect(color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
