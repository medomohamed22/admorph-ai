'use client';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The one waiting look for every box that paints an image (one-shot, shelf,
 * copies, seasons). Modern image tools show the picture "forming" instead of
 * a gray shimmer, so this box does the same with honest ingredients:
 *  - an aurora of the brand's own colors drifting behind,
 *  - the product (when we have it) heavily blurred, slowly coming into focus,
 *  - film grain that thins out as the seconds pass, like noise being removed,
 *  - a glowing border that turns around the frame.
 * The sharpening follows elapsed time only; it never claims model progress.
 * The label and the seconds counter stay readable in a glass pill.
 * With reduced motion everything stands still and the counter still runs.
 */
export function GeneratingCanvas({ colors, hint, children, className = '', testId, role = 'status' }: {
  colors?: readonly string[]; hint?: string | null; children?: ReactNode; className?: string; testId?: string; role?: 'status' | undefined;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);
  const palette = (colors ?? []).filter(color => /^#[0-9a-f]{6}$/i.test(color));
  const [a, b, c] = [palette[0] ?? '#7c5cff', palette[1] ?? '#e26d9b', palette[2] ?? '#36c2b4'];
  // 0 → 1 over roughly the length of one painting pass (~45 s), then holds.
  const focus = Math.min(1, seconds / 45);
  const style = { '--gen-a': a, '--gen-b': b, '--gen-c': c, '--gen-focus': focus.toFixed(3) } as CSSProperties;
  return <div className={`gen-canvas ${className}`.trim()} style={style} data-testid={testId} role={role} aria-live={role ? 'polite' : undefined}>
    <span className="gen-aurora" aria-hidden="true"><i /><i /><i /></span>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {hint && <img className="gen-hint" src={hint} alt="" aria-hidden="true" />}
    <span className="gen-grain" aria-hidden="true" />
    <span className="gen-sweep" aria-hidden="true" />
    <span className="gen-ring" aria-hidden="true" />
    {children && <span className="gen-label">{children}</span>}
  </div>;
}
