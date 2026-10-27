import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { detectDirection, hasMixedScripts, resolveLayerDirection } from '../../src/lib/editor/direction';
import { layerSchema } from '../../src/lib/editor/schema';
import { compose } from '../../src/lib/editor/composition';
import { newCampaign } from '../../src/lib/campaign/schema';
import { samplePlan } from '../../src/lib/campaign/sample';
import { checkCreative } from '../../src/lib/critic/rules';

describe('text direction detection', () => {
  it('reads the first strong character, ignoring neutrals', () => {
    expect(detectDirection('ساقعة على طول.')).toBe('rtl');
    expect(detectDirection('Ice-cold. Always.')).toBe('ltr');
    expect(detectDirection('123 … ساقعة')).toBe('rtl');
    expect(detectDirection('… 123 TALJ')).toBe('ltr');
    expect(detectDirection('')).toBe('ltr');
    expect(detectDirection('12345')).toBe('ltr');
  });

  it('flags mixed Arabic and Latin scripts only', () => {
    expect(hasMixedScripts('TALJ ساقعة')).toBe(true);
    expect(hasMixedScripts('ساقعة على طول')).toBe(false);
    expect(hasMixedScripts('Ice-cold. Always.')).toBe(false);
    expect(hasMixedScripts('')).toBe(false);
    expect(hasMixedScripts('123')).toBe(false);
  });

  it('prefers the explicit setting, then content, then the font hint', () => {
    expect(resolveLayerDirection({ text: 'ساقعة', fontFamily: 'Inter' })).toBe('rtl');
    expect(resolveLayerDirection({ text: 'TALJ', fontFamily: 'Cairo' })).toBe('ltr');
    expect(resolveLayerDirection({ text: 'TALJ', fontFamily: 'Cairo', dir: 'rtl' })).toBe('rtl');
    expect(resolveLayerDirection({ text: 'ساقعة', fontFamily: 'Inter', dir: 'ltr' })).toBe('ltr');
    expect(resolveLayerDirection({ text: '', fontFamily: 'Cairo' })).toBe('rtl');
    expect(resolveLayerDirection({ text: '', fontFamily: 'Inter' })).toBe('ltr');
    expect(resolveLayerDirection({ text: 'ساقعة', fontFamily: 'Cairo', dir: 'auto' })).toBe('rtl');
  });
});

describe('layer direction schema and critic rule', () => {
  const baseLayer = {
    id: crypto.randomUUID(),
    kind: 'headline' as const,
    x: 0, y: 0, width: 100, height: 50,
    text: 'Hello', color: '#000000', fill: '#ffffff',
    fontFamily: 'Inter' as const, fontSize: 20,
    visible: true, assetId: null,
  };

  it('keeps old layers valid and validates the new field', () => {
    expect(layerSchema.safeParse(baseLayer).success).toBe(true);
    expect(layerSchema.safeParse({ ...baseLayer, dir: 'rtl' }).success).toBe(true);
    expect(layerSchema.safeParse({ ...baseLayer, dir: 'both' }).success).toBe(false);
  });

  it('warns on a mixed-script layer and stays silent otherwise', () => {
    const campaign = newCampaign();
    const concept = { ...samplePlan(campaign).concepts[0], id: crypto.randomUUID(), approved: true };
    const creative = compose(campaign, concept, crypto.randomUUID(), crypto.randomUUID());
    const metrics = Object.fromEntries(creative.layers.map((layer) => [layer.id, { neededHeight: 70, unrenderable: false }]));
    const assets = new Set(creative.layers.flatMap((layer) => (layer.assetId ? [layer.assetId] : [])));
    creative.layers.find((layer) => layer.kind === 'headline')!.text = 'TALJ ساقعة';
    const mixed = checkCreative(creative, metrics, assets);
    expect(mixed.issues.map((issue) => issue.code)).toContain('mixed_scripts');
    expect(mixed.issues.find((issue) => issue.code === 'mixed_scripts')?.severity).toBe('warning');
    expect(mixed.checks.find((check) => check.key === 'copy')?.status).toBe('fail');
    creative.layers.find((layer) => layer.kind === 'headline')!.text = 'ساقعة على طول';
    const clean = checkCreative(creative, metrics, assets);
    expect(clean.issues.map((issue) => issue.code)).not.toContain('mixed_scripts');
  });
});
