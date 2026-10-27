// Auto-run state machine and persistence record. Pure: no DOM, no network,
// no provider calls. The UI component drives execution; this module only
// tracks steps, validates the synchronous inputs, and defines the record
// shape stored in Dexie.

import { z } from 'zod';
import { hexSchema } from '../db/schema';
import { creativeSchema, type Creative } from '../editor/schema';
import { backgroundBriefSchema, backgroundStyleSchema, type BackgroundBrief } from '../background/brief';

export const AUTO_RUN_STEPS = [
  'cutout',
  'analysis',
  'backgrounds',
  'composition',
  'copy',
  'review',
] as const;
export type AutoRunStepId = (typeof AUTO_RUN_STEPS)[number];
export type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type AutoRunStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface AutoRunStepState {
  id: AutoRunStepId;
  status: StepStatus;
  error?: string;
}

export interface AutoRunRecord {
  id: string;
  status: AutoRunStatus;
  steps: AutoRunStepState[];
  brandName: string;
  brandColors: [string, string, string];
  brandDescription: string;
  productCategory: string;
  stylePreset: z.infer<typeof backgroundStyleSchema>;
  productAssetId: string | null;
  cutoutAssetId: string | null;
  backgroundAssetId: string | null;
  brief: BackgroundBrief | null;
  hero: Creative | null;
  tagline: string;
  caption: string;
  dominantColors: string[];
  reviewCodes: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const autoRunRecordSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['running', 'done', 'failed', 'cancelled']),
    steps: z
      .array(
        z.object({
          id: z.enum(AUTO_RUN_STEPS),
          status: z.enum(['pending', 'running', 'done', 'failed']),
          error: z.string().optional(),
        }),
      )
      .length(6),
    brandName: z.string(),
    brandColors: z.tuple([hexSchema, hexSchema, hexSchema]),
    brandDescription: z.string(),
    productCategory: z.string(),
    stylePreset: backgroundStyleSchema,
    productAssetId: z.string().uuid().nullable(),
    cutoutAssetId: z.string().uuid().nullable(),
    backgroundAssetId: z.string().uuid().nullable(),
    brief: backgroundBriefSchema.nullable(),
    hero: creativeSchema.nullable(),
    tagline: z.string(),
    caption: z.string(),
    dominantColors: z.array(z.string()),
    reviewCodes: z.array(z.string()),
    error: z.string().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type AutoRunRecordInput = {
  brandName: string;
  brandColors: [string, string, string];
  brandDescription: string;
  productCategory: string;
  stylePreset: z.infer<typeof backgroundStyleSchema>;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Synchronous preflight: brand name and three HEX colors. The product
 *  file is validated separately (async) by the component before starting. */
export function preflight(input: {
  brandName: string;
  brandColors: [string, string, string];
}): string[] {
  const errors: string[] = [];
  if (!input.brandName.trim()) errors.push('brandName');
  if (input.brandColors.length !== 3 || input.brandColors.some((color) => !HEX.test(color))) {
    errors.push('colors');
  }
  return errors;
}

export function createRun(input: AutoRunRecordInput): AutoRunRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    status: 'running',
    steps: AUTO_RUN_STEPS.map((id) => ({ id, status: 'pending' as const })),
    brandName: input.brandName,
    brandColors: input.brandColors,
    brandDescription: input.brandDescription,
    productCategory: input.productCategory,
    stylePreset: input.stylePreset,
    productAssetId: null,
    cutoutAssetId: null,
    backgroundAssetId: null,
    brief: null,
    hero: null,
    tagline: '',
    caption: '',
    dominantColors: [],
    reviewCodes: [],
    createdAt: now,
    updatedAt: now,
  };
}

function touch(run: AutoRunRecord): AutoRunRecord {
  return { ...run, updatedAt: new Date().toISOString() };
}

export function markStep(
  run: AutoRunRecord,
  id: AutoRunStepId,
  status: StepStatus,
  error?: string,
): AutoRunRecord {
  return touch({
    ...run,
    steps: run.steps.map((step) =>
      step.id === id ? { id, status, ...(error ? { error } : {}) } : step,
    ),
  });
}

export function finishRun(
  run: AutoRunRecord,
  status: AutoRunStatus,
  error?: string,
): AutoRunRecord {
  return touch({ ...run, status, ...(error ? { error } : {}) });
}

/** Reset a step and everything after it to pending, so a retry re-runs
 *  from the failed step while keeping earlier outputs. */
export function resetFrom(run: AutoRunRecord, id: AutoRunStepId): AutoRunRecord {
  const from = AUTO_RUN_STEPS.indexOf(id);
  return touch({
    ...run,
    status: 'running',
    error: undefined,
    steps: run.steps.map((step, index) =>
      index >= from ? { id: step.id, status: 'pending' as const } : step,
    ),
  });
}

export function nextPendingStep(run: AutoRunRecord): AutoRunStepId | null {
  return run.steps.find((step) => step.status === 'pending')?.id ?? null;
}
