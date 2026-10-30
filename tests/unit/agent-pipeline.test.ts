import { describe, it, expect } from 'vitest';
import { AGENT_STEPS, emptyRecords, repairNotes, redactForDetails, stepSeconds, REPAIR_THRESHOLD } from '../../src/lib/agent/pipeline';
import { buildOneshotPrompt, oneshotRequestSchema, oneshotScore, type VerifyResult } from '../../src/lib/ai/oneshot';

const passing: VerifyResult = { productKept: true, productNote: '', logoKept: true, logoNote: '', layoutKept: true, layoutNote: '', texts: [{ id: 'headline', expected: 'Fresh', found: 'Fresh', match: true }] };

describe('agent pipeline', () => {
  it('has seven steps over three models plus the local check', () => {
    expect(AGENT_STEPS.map(step => step.id)).toEqual(['locate', 'cutout', 'brand', 'ideas', 'check', 'paint', 'critic']);
    expect(new Set(AGENT_STEPS.map(step => step.model))).toEqual(new Set(['spark', 'sam', 'image', 'local']));
    expect(Object.values(emptyRecords()).every(record => record.status === 'waiting')).toBe(true);
  });

  it('reports a finished step in seconds and nothing for an unfinished one', () => {
    expect(stepSeconds({ status: 'done', startedAt: 1000, endedAt: 3450 })).toBe(2.5);
    expect(stepSeconds({ status: 'running', startedAt: 1000 })).toBeNull();
  });

  it('writes no repair notes for a passing certificate', () => {
    expect(repairNotes(passing, true)).toEqual([]);
    expect(oneshotScore(passing, true)).toBeGreaterThanOrEqual(REPAIR_THRESHOLD);
  });

  it('turns each failed check into one concrete note, and skips the logo when none was expected', () => {
    const failed: VerifyResult = { ...passing, productKept: false, productNote: 'bottle became a can', logoKept: false, layoutKept: false, layoutNote: 'headline moved', texts: [{ id: 'headline', expected: 'Fresh', found: 'Frseh', match: false }] };
    const notes = repairNotes(failed, false);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toContain('bottle became a can');
    expect(notes[1]).toContain('headline moved');
    expect(notes[2]).toContain('"Fresh"');
    expect(notes[2]).toContain('"Frseh"');
    expect(repairNotes(failed, true)).toHaveLength(4);
    expect(oneshotScore(failed, true)).toBeLessThan(REPAIR_THRESHOLD);
  });

  it('never shows the key or raw image data in step details', () => {
    const shown = redactForDetails({ apiKey: 'secret-key', modelId: 'm', image: { mimeType: 'image/png', data: 'A'.repeat(4096) } });
    expect(shown).not.toHaveProperty('apiKey');
    expect(shown.image).toBe('[image/png image, 3 KB]');
    expect(JSON.stringify(shown)).not.toContain('secret-key');
  });
});

describe('one-shot repair retry', () => {
  const layout = [{ id: 'product', kind: 'product' as const, x: 340, y: 380, width: 400, height: 600 }];
  const brand = { name: 'Sora', description: 'Tea', colors: ['#111111', '#222222', '#333333'] as [string, string, string] };
  it('adds the fix notes to the painter prompt only when present', () => {
    expect(buildOneshotPrompt(brand, 'a kitchen', layout, 'en')).not.toContain('previous attempt');
    const prompt = buildOneshotPrompt(brand, 'a kitchen', layout, 'en', ['Keep the logo.', 'Write "Fresh" exactly.']);
    expect(prompt).toContain('A previous attempt failed review');
    expect(prompt).toContain('(1) Keep the logo. (2) Write "Fresh" exactly.');
  });
  it('accepts up to eight short notes and rejects empty or oversized ones', () => {
    const base = { providerId: 'meta', modelId: 'muse-image-1.0', apiKey: 'fixture-key', consent: true, imageConsent: true, mockup: { mimeType: 'image/png', data: 'iVBORw0KGgo=' }, brand, scene: 'a kitchen', language: 'en', layout };
    expect(oneshotRequestSchema.safeParse(base).success).toBe(true);
    expect(oneshotRequestSchema.safeParse({ ...base, fixNotes: ['Keep the logo.'] }).success).toBe(true);
    expect(oneshotRequestSchema.safeParse({ ...base, fixNotes: [] }).success).toBe(false);
    expect(oneshotRequestSchema.safeParse({ ...base, fixNotes: ['x'.repeat(301)] }).success).toBe(false);
    expect(oneshotRequestSchema.safeParse({ ...base, fixNotes: Array(9).fill('note') }).success).toBe(false);
  });
});

describe('repair notes for extra text', () => {
  it('asks the painter to remove each invented word', () => {
    expect(repairNotes({ ...passing, extraText: ['Aero Stride'] }, false)).toEqual(['Remove the text "Aero Stride"; only the mockup\'s own words may appear.']);
  });
});
