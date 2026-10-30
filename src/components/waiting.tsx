'use client';
import { useEffect, useState } from 'react';
import { useMessages } from './workspace';

/** Seconds since mount, ticking four times a second so the first tick
 *  lands fast. Mounted only while an async job runs, so the count is
 *  always that job's elapsed time. */
function useElapsed(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, []);
  return seconds;
}

/** The universal waiting state: a spinner, the phase label, and a live
 *  seconds counter, so no button ever runs silently. Under
 *  prefers-reduced-motion the ring stays still and the counter still
 *  advances. */
export function WaitingText({ label }: { label: string }) {
  const seconds = useElapsed();
  const unit = useMessages().waiting.seconds;
  return <span className="waiting" data-testid="waiting-indicator"><span className="waiting-spinner" aria-hidden="true" />{label} · {seconds} {unit}</span>;
}
