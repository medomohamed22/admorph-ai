import type { MetaModelKey } from '../ai/models';
import type { VerifyResult } from '../ai/oneshot';

/**
 * The visible agent: seven steps, three models, one repair loop. Each step
 * names the model that does it (or `local` for the deterministic check), so
 * the judge can read the architecture off the screen while it runs.
 */
export type AgentStepId = 'locate' | 'cutout' | 'brand' | 'ideas' | 'check' | 'paint' | 'critic';
export const AGENT_STEPS: { id: AgentStepId; model: MetaModelKey | 'local' }[] = [
  { id: 'locate', model: 'spark' },
  { id: 'cutout', model: 'sam' },
  { id: 'brand', model: 'spark' },
  { id: 'ideas', model: 'spark' },
  { id: 'check', model: 'local' },
  { id: 'paint', model: 'image' },
  { id: 'critic', model: 'spark' },
];

export type StepStatus = 'waiting' | 'running' | 'done' | 'failed' | 'skipped';
export type StepRecord = {
  status: StepStatus;
  startedAt?: number;
  endedAt?: number;
  /** One short line under the card: the box, the cutout, the headline, the score. */
  result?: string;
  error?: string;
  /** What was sent and what came back, for "Show details". Never carries keys or image data. */
  detail?: { request?: unknown; response?: unknown };
};
export type AgentRecords = Record<AgentStepId, StepRecord>;

export function emptyRecords(): AgentRecords {
  return Object.fromEntries(AGENT_STEPS.map(step => [step.id, { status: 'waiting' }])) as AgentRecords;
}

/** Elapsed seconds of a finished step, one decimal. */
export function stepSeconds(record: StepRecord): number | null {
  if (record.startedAt === undefined || record.endedAt === undefined) return null;
  return Math.round((record.endedAt - record.startedAt) / 100) / 10;
}

/** Below this certificate score the critic's notes go back to the painter once. */
export const REPAIR_THRESHOLD = 80;

/**
 * Turn a failed certificate into short, concrete instructions for the second
 * painting attempt. Only failed checks produce a note; a passing certificate
 * produces none, so the loop never runs on a good ad.
 */
export function repairNotes(certificate: VerifyResult, logoExpected: boolean): string[] {
  const notes: string[] = [];
  const clip = (text: string) => text.trim().slice(0, 200);
  if (!certificate.productKept) notes.push(`Keep the exact product from the mockup: same shape, colors and packaging.${certificate.productNote ? ` Critic: ${clip(certificate.productNote)}` : ''}`);
  if (logoExpected && !certificate.logoKept) notes.push(`Show the logo in its mockup position, unchanged.${certificate.logoNote ? ` Critic: ${clip(certificate.logoNote)}` : ''}`);
  if (!certificate.layoutKept) notes.push(`Put every element back in its mockup zone.${certificate.layoutNote ? ` Critic: ${clip(certificate.layoutNote)}` : ''}`);
  for (const text of certificate.texts) {
    if (!text.match) notes.push(`Write "${clip(text.expected)}" exactly as given${text.found ? `; the last attempt read "${clip(text.found)}"` : ''}.`);
  }
  for (const extra of certificate.extraText ?? []) notes.push(`Remove the text "${clip(extra)}"; only the mockup's own words may appear.`);
  const why = certificate.qualityNote ? ` Critic: ${clip(certificate.qualityNote)}` : '';
  if (certificate.textReadable === false) notes.push(`Make every word readable: move the headline to a calm, object-free part of the scene with strong contrast (dark on light or light on dark), with at most a soft shadow, never a band or box.${why}`);
  if (certificate.cleanFrame === false) notes.push(`Fill the whole frame with one continuous scene: remove every flat band, bar, border, box or frame, including behind the headline.${why}`);
  if (certificate.textClearOfProduct === false) notes.push(`Move the text, price tag and button off the product with a clear gap; the product must be fully visible.${why}`);
  return notes.slice(0, 8);
}

/** Strip anything bulky or secret before a request is shown in "Show details". */
export function redactForDetails(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'apiKey') continue;
    if (value && typeof value === 'object' && 'data' in (value as Record<string, unknown>) && 'mimeType' in (value as Record<string, unknown>)) {
      const image = value as { mimeType: string; data: string };
      result[key] = `[${image.mimeType} image, ${Math.round(image.data.length * 0.75 / 1024)} KB]`;
    } else result[key] = value;
  }
  return result;
}
