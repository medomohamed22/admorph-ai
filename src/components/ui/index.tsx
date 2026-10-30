'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { META_MODELS, type MetaModelKey } from '@/lib/ai/models';
import { IconCheck } from './icons';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Measures the active child of a container and returns a style that places a
 * sliding indicator under it. The indicator animates with a CSS spring-like
 * curve (see .slide-indicator); the first placement does not animate.
 */
export function useSlidingIndicator(container: RefObject<HTMLElement | null>, selector: string, deps: unknown[]): CSSProperties {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; ready: boolean; animate: boolean } | null>(null);
  useIsoLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const place = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>(selector);
      if (!active) { setBox(null); return; }
      setBox({ x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight, ready: true, animate });
    };
    place(box !== null);
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  if (!box) return { opacity: 0 };
  return { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)`, transition: box.animate ? undefined : 'none' };
}

/* ---------------- Button ---------------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonBase = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; loading?: boolean; icon?: ReactNode; className?: string; children?: ReactNode };

export function Button({ variant = 'secondary', size = 'md', block, loading, icon, className, children, disabled, type = 'button', ...rest }:
  ButtonBase & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cx('ui-btn', `ui-btn--${variant}`, size !== 'md' && `ui-btn--${size}`, block && 'ui-btn--block', className)}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'secondary', size = 'md', block, icon, className, children, ...rest }:
  Omit<ButtonBase, 'loading'> & ComponentProps<typeof Link>) {
  return (
    <Link className={cx('ui-btn', `ui-btn--${variant}`, size !== 'md' && `ui-btn--${size}`, block && 'ui-btn--block', className)} {...rest}>
      {icon}{children}
    </Link>
  );
}

/* ---------------- Card ---------------- */
export function Card({ as: Tag = 'section', interactive, glow, flat, className, children, ...rest }:
  { as?: 'section' | 'article' | 'div' | 'aside'; interactive?: boolean; glow?: boolean; flat?: boolean; className?: string; children?: ReactNode } & Record<string, unknown>) {
  return <Tag className={cx('ui-card', interactive && 'ui-card--interactive', glow && 'ui-card--glow', flat && 'ui-card--flat', className)} {...rest}>{children}</Tag>;
}

/* ---------------- Model badge ---------------- */
export function ModelBadge({ model, chip, detail }: { model: MetaModelKey; chip?: boolean; detail?: ReactNode }) {
  return (
    <span className={cx('model-badge', chip && 'model-badge--chip')} data-model={model}>
      <i aria-hidden="true" />{META_MODELS[model].name}{detail ? <small>{detail}</small> : null}
    </span>
  );
}

/* ---------------- Status chip ---------------- */
export function StatusChip({ tone = 'neutral', busy, children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad'; busy?: boolean; children: ReactNode }) {
  return <span className={cx('status-chip', tone !== 'neutral' && `status-chip--${tone}`, busy && 'status-chip--busy')}>{children}</span>;
}

/* ---------------- Segmented control ---------------- */
export type SegmentedOption<T extends string> = { value: T; label: ReactNode; ariaLabel?: string };
export function Segmented<T extends string>({ options, value, onChange, label, className }:
  { options: SegmentedOption<T>[]; value: T; onChange: (value: T) => void; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const indicator = useSlidingIndicator(ref, 'button[aria-checked=true]', [value, options.length]);
  function onKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const index = options.findIndex(option => option.value === value);
    const rtl = document.documentElement.dir === 'rtl';
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (event.key === forward || event.key === 'ArrowDown') next = (index + 1) % options.length;
    if (event.key === back || event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next].value);
    (event.currentTarget.querySelectorAll('button')[next] as HTMLButtonElement | undefined)?.focus();
  }
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={cx('ui-segmented', className)} onKeyDown={onKey}>
      <span className="seg-pill slide-indicator" style={indicator} aria-hidden="true" />
      {options.map(option => {
        const active = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} aria-label={option.ariaLabel}
            tabIndex={active ? 0 : -1} onClick={() => onChange(option.value)}>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Choice card ---------------- */
export function ChoiceCard({ selected, onSelect, children, className, ...rest }:
  { selected: boolean; onSelect: () => void; children: ReactNode; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button type="button" className={cx('choice-card', className)} aria-pressed={selected} onClick={onSelect} {...rest}>
      {selected && <span className="choice-check" aria-hidden="true"><IconCheck size={13} strokeWidth={3} /></span>}
      {children}
    </button>
  );
}

/* ---------------- Score ring ---------------- */
export function ScoreRing({ value, size = 132, stroke = 10, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const [shown, setShown] = useState(0);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const start = performance.now(), duration = reduce ? 0 : 1100;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      setShown(Math.round(clamped * ease(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(t => { setDrawn(true); tick(t); });
    return () => cancelAnimationFrame(frame);
  }, [clamped]);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const color = clamped >= 80 ? 'var(--ok)' : clamped >= 60 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div className="score-ring" style={{ width: size, height: size, ['--ring-color' as string]: color }} role="img" aria-label={`${label}: ${clamped}/100`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-value" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={drawn ? c * (1 - clamped / 100) : c} />
      </svg>
      <output aria-hidden="true" style={{ fontSize: size * (clamped >= 100 ? 0.24 : 0.3) }}>{shown}<small>/100</small></output>
    </div>
  );
}

/* ---------------- Toast ---------------- */
/** A short message that floats in, stays readable for a few seconds, then leaves. */
export function Toast({ message, tone = 'neutral', onDone, duration = 3200 }: { message: string; tone?: 'neutral' | 'ok' | 'bad'; onDone: () => void; duration?: number }) {
  // The latest onDone, so a parent re-render never restarts the timer.
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  useEffect(() => {
    const timer = setTimeout(() => done.current(), duration);
    return () => clearTimeout(timer);
  }, [message, duration]);
  return <div className={cx('ui-toast', tone !== 'neutral' && `ui-toast--${tone}`)} role={tone === 'bad' ? 'alert' : 'status'} data-testid="toast">{message}</div>;
}
