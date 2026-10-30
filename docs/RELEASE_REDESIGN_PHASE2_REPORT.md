# Redesign Phase 2: responsive system (Oct 30, 2026)

Phase 2 of the owner-approved redesign plan. No flows, models, or
copy changed — only layout and where actions sit.

## What changed

- One centered container (900px) for the one-shot and remix pages,
  which previously had no width limit at all.
- The generate action is now a fixed bar on every viewport, not
  only phones: the in-flow generate button is hidden and the sticky
  bar is always reachable. On phones it sits 60px up, above the new
  mobile nav.
- Settings save moved into the same fixed-bar pattern (save +
  cancel), so a long settings page can no longer hide its save
  button at the bottom.
- Mobile nav: on phones (<=750px) the five header page links hide
  and a fixed five-item bottom bar replaces them; the header keeps
  only the wordmark, language, and session lock on one row. The
  bottom bar's links carry the same labels, so existing navigation
  keeps working.
- Grids collapse on phones: brand library and brand builder go
  single-column, and the brand preview stops sticking.
- Global phone clearance: body bottom padding on phones so no
  page's footer hides under the fixed nav.
- One test-only fix the gate forced: the one-shot drag test's fixed
  2-unit tolerance sits below one device pixel at phone scale
  (1px is about 4 logical units once the centered container narrows
  the canvas), so it flaked on pointer rounding with the product
  actually dragged correctly. The tolerance is now scale-aware
  (2 units plus one device pixel); no drag code changed.

## Gate

- ESLint: 0 errors (pre-existing warnings only)
- TypeScript: clean
- Unit: 332/332
- Clean production build
- E2E: one-shot + brand-fixes + wordmark-logo + ad-remix +
  responsive specs, including sticky-bar/nav visibility per
  viewport and a no-horizontal-overflow check on /, /oneshot,
  /brands.
- No paid calls.
