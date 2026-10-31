'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMessages } from './workspace';
import { WaitingText } from './waiting';
import {
  DEMO_STEPS, DEMO_IDLE, DEMO_MIN_DWELL_MS, DEMO_AUTO_GAP_MS, DEMO_REQUESTS_ESTIMATE, isFinished, parseDemoState, pageUrl,
  type DemoDriver, type DemoMode, type DemoPage, type DemoState, type DemoModel,
} from '@/lib/demo/tour';

const STORE = 'admorph-demo-tour';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

type TourApi = {
  state: DemoState;
  start: (mode: DemoMode) => void;
  register: (page: DemoPage, driver: RefObject<DemoDriver>) => () => void;
  /** True while the tour is driving this page: pages lock nothing, but can hide their own hints. */
  drivingPage: DemoPage | null;
};
const TourContext = createContext<TourApi | null>(null);

/**
 * The guided demo. The run lives in sessionStorage (a few numbers and an
 * ad id, never images), so it survives page changes and a reload. Each page
 * registers a driver; the tour calls it phase by phase with the page's
 * latest functions and state, so a step always acts on fresh data.
 */
export function DemoTour({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<DemoState>(DEMO_IDLE);
  const [loaded, setLoaded] = useState(false);
  const drivers = useRef(new Map<DemoPage, RefObject<DemoDriver>>());
  const [registered, setRegistered] = useState<DemoPage[]>([]);
  const token = useRef(0);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(STORE); } catch { /* storage blocked: the tour still runs for this page */ }
    const parsed = parseDemoState(stored);
    Promise.resolve().then(() => { setState(parsed); setLoaded(true); });
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { if (state.active) sessionStorage.setItem(STORE, JSON.stringify(state)); else sessionStorage.removeItem(STORE); } catch { /* ignore */ }
  }, [state, loaded]);

  const register = useCallback((page: DemoPage, driver: RefObject<DemoDriver>) => {
    drivers.current.set(page, driver);
    setRegistered(previous => previous.includes(page) ? previous : [...previous, page]);
    return () => {
      if (drivers.current.get(page) === driver) drivers.current.delete(page);
      setRegistered(previous => previous.filter(item => item !== page));
    };
  }, []);

  const start = useCallback((mode: DemoMode) => {
    token.current++;
    setState({ ...DEMO_IDLE, active: true, mode, status: 'go', startedAt: Date.now() });
    router.push(pageUrl(DEMO_STEPS[0].page, {}));
  }, [router]);
  const exit = useCallback(() => { token.current++; setState(DEMO_IDLE); }, []);

  const step = DEMO_STEPS[state.index];
  const finished = isFinished(state);

  // Move to the step's page when it is due and the tour is elsewhere.
  useEffect(() => {
    if (!state.active || !step || (state.status !== 'go' && state.status !== 'running')) return;
    // Read the location here rather than with usePathname: the layout must not opt every route into dynamic rendering.
    const target = pageUrl(step.page, state.memory);
    if (window.location.pathname !== target.split('?')[0]) router.push(target);
  }, [state.active, state.status, state.memory, step, router, registered]);

  // Automatic mode starts the next step by itself; step mode waits for Next.
  useEffect(() => {
    if (!state.active || finished || state.paused || state.mode !== 'auto' || state.status !== 'pending') return;
    const timer = setTimeout(() => setState(previous => previous.status === 'pending' ? { ...previous, status: 'go' } : previous), 300);
    return () => clearTimeout(timer);
  }, [state.active, state.mode, state.status, state.paused, finished]);
  useEffect(() => {
    if (!state.active || finished || state.paused || state.mode !== 'auto' || state.status !== 'done') return;
    const timer = setTimeout(() => setState(previous => previous.status === 'done' ? { ...previous, index: previous.index + 1, status: previous.index + 1 >= DEMO_STEPS.length ? 'done' : 'go', error: undefined, ...(previous.index + 1 >= DEMO_STEPS.length ? { finishedAt: Date.now() } : {}) } : previous), DEMO_AUTO_GAP_MS);
    return () => clearTimeout(timer);
  }, [state.active, state.mode, state.status, state.paused, finished]);

  // Run a due step once its page has registered a driver.
  useEffect(() => {
    if (!state.active || !step || state.status !== 'go' || !registered.includes(step.page)) return;
    const mine = ++token.current;
    const memory = { ...state.memory };
    const mode = state.mode;
    setState(previous => ({ ...previous, status: 'running', error: undefined }));
    void (async () => {
      const began = Date.now(), deadline = began + step.timeoutMs;
      let phase = 0;
      try {
        for (;;) {
          if (token.current !== mine) return;
          const driver = drivers.current.get(step.page)?.current;
          if (!driver) { await sleep(300); continue; }
          const result = await driver(step.id, phase, memory);
          if (token.current !== mine) return;
          if (result === 'done') break;
          if (result === 'next') phase++;
          if (Date.now() > deadline) throw new Error('timeout');
          await sleep(result === 'wait' ? 300 : 350);
        }
        if (mode === 'auto') { const rest = DEMO_MIN_DWELL_MS - (Date.now() - began); if (rest > 0) await sleep(rest); }
        if (token.current !== mine) return;
        const seconds = Math.round((Date.now() - began) / 100) / 10;
        setState(previous => ({ ...previous, status: 'done', memory, took: { ...previous.took, [step.id]: seconds } }));
      } catch (cause) {
        if (token.current !== mine) return;
        setState(previous => ({ ...previous, status: 'failed', error: cause instanceof Error ? cause.message : String(cause) }));
      }
    })();
  }, [state.active, state.status, state.index, state.memory, state.mode, step, registered]);

  const next = useCallback(() => setState(previous => {
    const index = previous.index + 1, last = index >= DEMO_STEPS.length;
    return { ...previous, index, status: last ? 'done' : 'go', error: undefined, ...(last ? { finishedAt: Date.now() } : {}) };
  }), []);
  const skip = useCallback(() => { token.current++; setState(previous => {
    const current = DEMO_STEPS[previous.index], index = previous.index + 1, last = index >= DEMO_STEPS.length;
    return { ...previous, index, status: last ? 'done' : previous.mode === 'auto' && !previous.paused ? 'go' : 'pending', error: undefined, skipped: current ? [...previous.skipped, current.id] : previous.skipped, ...(last ? { finishedAt: Date.now() } : {}) };
  }); }, []);
  const retry = useCallback(() => setState(previous => ({ ...previous, status: 'go', error: undefined })), []);
  const runNow = useCallback(() => setState(previous => ({ ...previous, status: 'go' })), []);
  const setMode = useCallback((mode: DemoMode) => setState(previous => ({ ...previous, mode })), []);
  const togglePause = useCallback(() => setState(previous => ({ ...previous, paused: !previous.paused })), []);

  const api = useMemo<TourApi>(() => ({ state, start, register, drivingPage: state.active && step && state.status === 'running' ? step.page : null }), [state, start, register, step]);
  return <TourContext.Provider value={api}>
    {state.active && <DemoBar state={state} finished={finished} onNext={next} onSkip={skip} onRetry={retry} onRun={runNow} onExit={exit} onMode={setMode} onPause={togglePause} />}
    {children}
  </TourContext.Provider>;
}

export function useDemoTour() { return useContext(TourContext); }

/** A page hands the tour its driver; the ref is refreshed every render so each phase sees the latest state. */
export function useDemoDriver(page: DemoPage | null, driver: DemoDriver) {
  const tour = useContext(TourContext);
  const ref = useRef<DemoDriver>(driver);
  useEffect(() => { ref.current = driver; });
  const register = tour?.register;
  useEffect(() => page ? register?.(page, ref) : undefined, [register, page]);
}

const MODEL_NAME: Record<Exclude<DemoModel, 'local'>, string> = { sam: 'SAM 3.1', spark: 'Muse Spark', image: 'Muse Image' };

function DemoBar({ state, finished, onNext, onSkip, onRetry, onRun, onExit, onMode, onPause }: { state: DemoState; finished: boolean; onNext: () => void; onSkip: () => void; onRetry: () => void; onRun: () => void; onExit: () => void; onMode: (mode: DemoMode) => void; onPause: () => void }) {
  const t = useMessages().demo;
  const step = DEMO_STEPS[state.index];
  const total = DEMO_STEPS.length;
  if (finished) {
    const seconds = state.startedAt && state.finishedAt ? Math.round((state.finishedAt - state.startedAt) / 1000) : null;
    return <aside className="demo-bar is-finished" role="region" aria-label={t.label} data-testid="demo-bar" data-state="finished">
      <div className="demo-bar-main">
        <span className="demo-bar-kicker">{t.finishedKicker}</span>
        <strong>{t.finishedTitle}</strong>
        <p>{t.finishedNote.replace('{done}', String(Object.keys(state.took).length)).replace('{total}', String(total)).replace('{s}', seconds === null ? '—' : String(seconds))}</p>
        <ol className="demo-summary">{DEMO_STEPS.map(item => <li key={item.id} className={state.took[item.id] !== undefined ? 'done' : 'skipped'}><span>{t.steps[item.id].title}</span><em>{state.took[item.id] !== undefined ? `${state.took[item.id]} ${t.seconds}` : t.skipped}</em></li>)}</ol>
      </div>
      <div className="demo-bar-actions">
        <Link className="button primary" href="/gallery" onClick={onExit}>{t.openGallery}</Link>
        <button type="button" className="button secondary" onClick={onExit}>{t.close}</button>
      </div>
    </aside>;
  }
  if (!step) return null;
  const copy = t.steps[step.id];
  const models = step.models.filter((model): model is Exclude<DemoModel, 'local'> => model !== 'local');
  return <aside className={`demo-bar is-${state.status}`} role="region" aria-label={t.label} data-testid="demo-bar" data-state={state.status} data-step={step.id}>
    <div className="demo-bar-progress" aria-hidden="true">{DEMO_STEPS.map((item, index) => <i key={item.id} className={index < state.index ? 'done' : index === state.index ? 'current' : ''} />)}</div>
    <div className="demo-bar-main">
      <span className="demo-bar-kicker">{t.stepOf.replace('{n}', String(state.index + 1)).replace('{total}', String(total))}
        {models.length > 0 ? models.map(model => <span key={model} className="demo-model" data-model={model}>{MODEL_NAME[model]}</span>) : <span className="demo-model" data-model="local">{t.onDevice}</span>}
      </span>
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      <div className="demo-bar-status" role="status" aria-live="polite">
        {state.status === 'running' && <WaitingText label={t.running} />}
        {state.status === 'done' && <span className="demo-ok">✓ {t.stepDone}{state.took[step.id] !== undefined ? ` · ${state.took[step.id]} ${t.seconds}` : ''}</span>}
        {state.status === 'failed' && <span className="demo-bad" role="alert">{state.error === 'timeout' ? t.timeout : t.failed}</span>}
        {state.status === 'pending' && <span>{state.mode === 'step' ? t.pressRun : state.paused ? t.paused : t.starting}</span>}
      </div>
    </div>
    <div className="demo-bar-actions">
      <div className="segmented demo-mode" role="group" aria-label={t.modeLabel}>
        <button type="button" aria-pressed={state.mode === 'auto'} onClick={() => onMode('auto')}>{t.auto}</button>
        <button type="button" aria-pressed={state.mode === 'step'} onClick={() => onMode('step')}>{t.step}</button>
      </div>
      {state.status === 'failed' && <><button type="button" className="button primary" onClick={onRetry}>{t.retry}</button><button type="button" className="button secondary" onClick={onSkip}>{t.skip}</button></>}
      {state.status === 'pending' && <button type="button" className="button primary" data-testid="demo-run" onClick={onRun}>{t.run}</button>}
      {state.status === 'done' && (state.mode === 'step' || state.paused) && <button type="button" className="button primary" data-testid="demo-next" onClick={onNext}>{state.index + 1 >= total ? t.finish : t.next}</button>}
      {state.mode === 'auto' && state.status !== 'failed' && <button type="button" className="button secondary" onClick={onPause} aria-pressed={state.paused}>{state.paused ? t.resume : t.pause}</button>}
      <button type="button" className="demo-exit" aria-label={t.exit} onClick={onExit}>×</button>
    </div>
  </aside>;
}

/** The start sheet: says what will happen and what it costs, then starts the chosen mode. */
export function DemoStart({ className = '' }: { className?: string }) {
  const t = useMessages().demo, tour = useDemoTour();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => { const node = dialog.current; if (!node) return; if (open && !node.open) node.showModal(); if (!open && node.open) node.close(); }, [open]);
  if (!tour) return null;
  const running = tour.state.active && !isFinished(tour.state);
  return <>
    <button type="button" className={`button secondary demo-start ${className}`.trim()} data-testid="demo-start" disabled={running} onClick={() => setOpen(true)}>
      <span className="demo-start-dot" aria-hidden="true" />{running ? t.alreadyRunning : t.startButton}
    </button>
    <dialog ref={dialog} className="demo-sheet" aria-labelledby="demo-sheet-title" onClose={() => setOpen(false)} onCancel={() => setOpen(false)}>
      <h2 id="demo-sheet-title">{t.sheetTitle}</h2>
      <p>{t.sheetLead}</p>
      <ol className="demo-sheet-steps">{DEMO_STEPS.map(item => <li key={item.id}>{t.steps[item.id].title}</li>)}</ol>
      <p className="demo-sheet-note">{t.sheetCost.replace('{n}', DEMO_REQUESTS_ESTIMATE)}</p>
      <div className="demo-sheet-actions">
        <button type="button" className="button primary" data-testid="demo-start-auto" onClick={() => { setOpen(false); tour.start('auto'); }}>{t.startAuto}</button>
        <button type="button" className="button secondary" data-testid="demo-start-step" onClick={() => { setOpen(false); tour.start('step'); }}>{t.startStep}</button>
        <button type="button" className="text-button" onClick={() => setOpen(false)}>{t.cancel}</button>
      </div>
    </dialog>
  </>;
}
