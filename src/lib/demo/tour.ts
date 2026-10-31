import type { BrandInput } from '../db/schema';

/**
 * The guided demo: one button walks the whole site with real Meta requests.
 * The steps are data so the bar, the pages and the tests share one list.
 * Nothing here is recorded or replayed; every image comes from the models
 * during the run, and a failed request stops the step with Retry / Skip.
 */
export type DemoPage = 'oneshot' | 'themes' | 'shelf';
export type DemoModel = 'sam' | 'spark' | 'image' | 'local';
export type DemoStepId = 'product' | 'brand' | 'ideas' | 'arrange' | 'paint' | 'season' | 'shelf-detect' | 'shelf-campaign';
export type DemoStep = { id: DemoStepId; page: DemoPage; models: DemoModel[]; /** Longest a step may run before it is reported as stuck. */ timeoutMs: number };

export const DEMO_STEPS: readonly DemoStep[] = [
  { id: 'product', page: 'oneshot', models: ['spark', 'sam'], timeoutMs: 150_000 },
  { id: 'brand', page: 'oneshot', models: ['local'], timeoutMs: 30_000 },
  { id: 'ideas', page: 'oneshot', models: ['spark'], timeoutMs: 240_000 },
  { id: 'arrange', page: 'oneshot', models: ['local'], timeoutMs: 30_000 },
  { id: 'paint', page: 'oneshot', models: ['image', 'spark'], timeoutMs: 300_000 },
  { id: 'season', page: 'themes', models: ['spark', 'image'], timeoutMs: 300_000 },
  { id: 'shelf-detect', page: 'shelf', models: ['spark', 'sam'], timeoutMs: 240_000 },
  { id: 'shelf-campaign', page: 'shelf', models: ['spark', 'image'], timeoutMs: 420_000 },
];

/** A phone photo bundled with the site, so the tour needs no upload. */
export const DEMO_PRODUCT_URL = '/demo/demo-product.webp';
export const DEMO_SHELF_URL = '/demo/shelf-sample.jpg';
/** The shelf part paints this many products, to keep the tour short and its cost small. */
export const DEMO_SHELF_PRODUCTS = 2;
/** In automatic mode each step stays on screen at least this long, so a viewer can read it. */
export const DEMO_MIN_DWELL_MS = 2500;
/** Pause between finished steps in automatic mode. */
export const DEMO_AUTO_GAP_MS = 1800;
/** About how many Meta requests one full run makes (shown before starting). */
export const DEMO_REQUESTS_ESTIMATE = '20–30';

export function demoBrand(locale: 'en' | 'ar'): BrandInput {
  return {
    name: 'Mono Audio',
    description: locale === 'ar' ? 'سماعات لاسلكية مريحة لساعات استماع طويلة وهادئة.' : 'Wireless over-ear headphones made for long, quiet listening.',
    colors: ['#16100C', '#F5EEDF', '#C8A27A'],
  };
}

export function demoShelfBrand(locale: 'en' | 'ar'): BrandInput {
  return {
    name: locale === 'ar' ? 'دكّان الحي' : 'Corner Store',
    description: locale === 'ar' ? 'متجر حي صغير: مشروبات وأحذية وإلكترونيات مختارة.' : 'A small neighborhood concept store: drinks, shoes and hand-picked tech.',
    colors: ['#7C5CFF', '#F5EEDF', '#16100C'],
  };
}

export const pageUrl = (page: DemoPage, memory: DemoMemory) => page === 'themes' ? `/themes${memory.adId ? `?ad=${encodeURIComponent(memory.adId)}` : ''}` : `/${page}`;

export type DemoMode = 'auto' | 'step';
export type DemoStatus = 'pending' | 'go' | 'running' | 'done' | 'failed';
export type DemoMemory = { adId?: string };
export type DemoState = {
  active: boolean; mode: DemoMode; index: number; status: DemoStatus; paused: boolean;
  error?: string; startedAt?: number; finishedAt?: number;
  /** Seconds each finished step took, by step id; skipped steps are absent. */
  took: Partial<Record<DemoStepId, number>>; skipped: DemoStepId[];
  memory: DemoMemory;
};
export const DEMO_IDLE: DemoState = { active: false, mode: 'auto', index: 0, status: 'pending', paused: false, took: {}, skipped: [], memory: {} };

/** The run is over once the index moves past the last step. */
export const isFinished = (state: DemoState) => state.active && state.index >= DEMO_STEPS.length;

/** Read a stored run; anything malformed starts clean instead of crashing the page. */
export function parseDemoState(raw: string | null): DemoState {
  if (!raw) return DEMO_IDLE;
  try {
    const value = JSON.parse(raw) as Partial<DemoState>;
    if (typeof value !== 'object' || value === null || typeof value.active !== 'boolean') return DEMO_IDLE;
    const index = Number.isInteger(value.index) ? Math.max(0, Math.min(DEMO_STEPS.length, value.index as number)) : 0;
    // A step that was running when the page reloaded cannot still be running: start it again.
    const status: DemoStatus = value.status === 'done' || value.status === 'failed' || value.status === 'pending' ? value.status : 'pending';
    return { ...DEMO_IDLE, ...value, index, status, mode: value.mode === 'step' ? 'step' : 'auto', paused: !!value.paused, took: value.took ?? {}, skipped: Array.isArray(value.skipped) ? value.skipped : [], memory: value.memory ?? {} };
  } catch { return DEMO_IDLE; }
}

/** What a page driver answers for one phase of a step. */
export type DemoPhaseResult = 'next' | 'wait' | 'done';
export type DemoDriver = (step: DemoStepId, phase: number, memory: DemoMemory) => Promise<DemoPhaseResult> | DemoPhaseResult;
