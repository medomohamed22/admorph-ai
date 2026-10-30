# Redesign Phase 1: universal waiting system (Oct 30, 2026)

Phase 1 of the owner-approved redesign plan. Every network wait in
the live paths now shows the same state instead of a silent label
swap.

## What changed

- New shared `WaitingText` component (`src/components/waiting.tsx`):
  a CSS spinner, the phase label, and a live seconds counter that
  ticks from the job's start. Under `prefers-reduced-motion` the ring
  stays still and the counter still advances.
- Applied to every network wait in the live paths:
  - One-shot: generate (main + sticky buttons), verify overlay,
    SAM cutout, brand extraction, idea suggestions, photo enhance.
  - Remix pages: plan + generate on both variants and themes.
  - Settings: per-role model test and catalog fetch.
- One new message key (`waiting.seconds`: "s" / "ث") in both
  locales. No other copy changed.
- Deliberately untouched: local sub-second actions (wordmark render,
  evidence ZIP, gallery save) need no indicator, and the legacy
  editor/campaign flows are out of the live paths.

## Gate

- ESLint: 0 errors (pre-existing warnings only)
- TypeScript: clean
- Unit: 332/332
- Clean production build
- E2E: one-shot + brand-fixes + wordmark-logo + ad-remix specs,
  including a new waiting test: a 3-second delayed generation shows
  the indicator, the seconds count advances, then the results appear.
- No paid calls.
