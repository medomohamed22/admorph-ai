# Redesign Phase 5: motion system (Oct 30, 2026)

The final phase of the owner-approved redesign plan. CSS and one
class application only — no logic, flows, or copy changed.

## What changed

- One shared motion language: a light opacity-only page fade on
  every page mount (opacity never creates a containing block, so
  the fixed generate/save/nav bars keep viewport positioning).
- Press feedback: buttons cancel their hover lift while pressed;
  picker cards and segmented buttons scale slightly on press.
- Stepper state animates: the one-shot step pills transition
  background and border color instead of snapping.
- The one-shot blur reveal is now shared: remix result images get
  the same reveal class, so new results fade in from blur the same
  way the one-shot result does.
- Reduced motion stays safe: the existing global rule already
  flattens every animation and transition, including the new ones,
  and the waiting spinner was already still under that rule.

## Gate

- ESLint: 0 errors (pre-existing warnings only)
- TypeScript: clean
- Unit: 332/332
- Clean production build
- E2E: one-shot + brand-fixes + wordmark-logo + ad-remix +
  responsive specs on 3 viewports, including a reveal-class
  assertion on remix results.
- No paid calls.
