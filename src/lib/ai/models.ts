import type { MetaTask } from './task-support';
import type { ModelSelection } from './schemas';

/**
 * AdMorph runs on exactly three Meta models, each with a fixed job.
 * Every AI route receives its model from this map; the user never picks one.
 */
export type MetaModelKey = 'spark' | 'image' | 'sam';

export type MetaModel = {
  key: MetaModelKey;
  id: string;
  name: string;
  /** Short role name shown in the UI ("the brain", "the painter", "the cutter"). */
  role: { en: string; ar: string };
  /** Task used by the optional diagnostic test in Settings. */
  testTask: MetaTask;
};

export const META_MODELS: Record<MetaModelKey, MetaModel> = {
  spark: { key: 'spark', id: 'muse-spark-1.3-contributor', name: 'Muse Spark 1.3', role: { en: 'The brain', ar: 'العقل' }, testTask: 'planner' },
  image: { key: 'image', id: 'muse-image-1.0', name: 'Muse Image 1.0', role: { en: 'The painter', ar: 'الرسّام' }, testTask: 'image' },
  sam: { key: 'sam', id: 'sam-3.1', name: 'SAM 3.1', role: { en: 'The cutter', ar: 'المقص' }, testTask: 'segment' },
};

export const META_MODEL_ORDER: MetaModelKey[] = ['spark', 'sam', 'image'];

/** Which model owns each task. */
export const TASK_MODEL: Record<MetaTask, MetaModelKey> = {
  planner: 'spark',
  vision: 'spark',
  critic: 'spark',
  copy: 'spark',
  edit: 'spark',
  image: 'image',
  image_edit: 'image',
  segment: 'sam',
};

export function modelForTask(task: MetaTask): MetaModel {
  return META_MODELS[TASK_MODEL[task]];
}

export function selectionForTask(task: MetaTask): ModelSelection {
  return { provider: 'meta', modelId: modelForTask(task).id };
}

export function tasksForModel(key: MetaModelKey): MetaTask[] {
  return (Object.keys(TASK_MODEL) as MetaTask[]).filter(task => TASK_MODEL[task] === key);
}
