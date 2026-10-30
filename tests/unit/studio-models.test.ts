import { describe, it, expect } from 'vitest';
import studioEn from '../../src/messages/studio.en.json';
import studioAr from '../../src/messages/studio.ar.json';
import { META_MODELS, TASK_MODEL, modelForTask, selectionForTask, tasksForModel } from '../../src/lib/ai/models';
import { taskSchema } from '../../src/lib/ai/task-support';
import { messages } from '../../src/lib/i18n';

const keys = (value: unknown, prefix = ''): string[] => value && typeof value === 'object'
  ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
  : [prefix];

describe('three fixed Meta models', () => {
  it('assigns every task to exactly one of the three models', () => {
    for (const task of taskSchema.options) expect(Object.keys(META_MODELS)).toContain(TASK_MODEL[task]);
    expect(modelForTask('planner').id).toBe('muse-spark-1.3-contributor');
    expect(modelForTask('vision').id).toBe('muse-spark-1.3-contributor');
    expect(modelForTask('critic').id).toBe('muse-spark-1.3-contributor');
    expect(modelForTask('image').id).toBe('muse-image-1.0');
    expect(modelForTask('image_edit').id).toBe('muse-image-1.0');
    expect(modelForTask('segment').id).toBe('sam-3.1');
    expect(selectionForTask('segment')).toEqual({ provider: 'meta', modelId: 'sam-3.1' });
    expect(tasksForModel('sam')).toEqual(['segment']);
  });
});

describe('studio strings', () => {
  it('keep English and Arabic in parity', () => {
    expect(keys(studioAr).sort()).toEqual(keys(studioEn).sort());
  });
  it('merge over the base dictionaries without dropping base keys', () => {
    expect(messages.en.nav.createAd).toBe('Create');
    expect(messages.en.nav.brands).toBeTruthy();
    expect(messages.ar.models.title).toBe('الإعدادات');
    expect(messages.ar.settings.errors.missing_key).toBeTruthy();
  });
});
