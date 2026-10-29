# One-shot simplification — release report (Oct 28, 2026)

The site used to offer three ways to make an ad (campaigns → layered
editor, auto-ads, one-shot). That confused the ordinary user, so the
one-shot mode became the whole site, rebuilt as one guided journey in
five steps: product → brand → idea → arrange → generate.

## Phase A — removal (PR #55)

- `src/app/campaigns/new/page.tsx`, `src/app/studio/[id]/page.tsx`,
  `src/app/auto-ads/page.tsx` and `src/app/auto-ads/cutout/page.tsx` are
  one-line redirects to `/oneshot` (307, not 404, and reversible).
- The header dropped the Explore / Campaigns / Auto ads links; the home
  page is a hero with a single call to action into `/oneshot`.
- The editor components stay in the repo unimported — they are not
  shipped to users. Deleting them is a separate, optional cleanup pass.

## Phase B — upload cards (PR #56)

- One `UploadCard` component for the product photo, the logo and the
  icon: a dashed card with a big ＋ glyph or a preview, a title, a hint
  and a single button, so it is always clear which button uploads what.
  The native file input keeps its exact accessible label and re-picking
  the same file works.
- The product card shows a busy pulse while SAM cuts the product out.

## Phase C — brand-kit picker (PR #57)

- `/oneshot` gained a brand picker listing every saved brand kit.
  Picking one fills the name, description, colors and logo at once.
- "Create a new brand" opens `/brands/new?returnTo=/oneshot` and returns
  to `/oneshot` with the new brand already selected; cancel returns
  without selecting.
- Manual brand fields moved under an "Edit brand details" collapsible;
  hand edits switch the picker back to "Custom brand".
- `/brands/new` and `/oneshot` read their query parameters under a
  `<Suspense>` boundary — the first build caught that reading
  `searchParams` during prerendering fails the production build.

## Phase D — ideas from the photo and brand (PR #58)

- The written brief is now optional extra direction. "Suggest 3 ad
  ideas" enables as soon as the product, brand, key and consent are
  ready; the planner already receives the product photo and the full
  brand snapshot, so with no brief the server prompt says explicitly to
  derive the concepts from the photo and the brand identity alone.
- No separate vision pre-pass was added: the planner model itself sees
  the product photo, so an extra vision call would cost a paid call for
  no new information.

## Phase E — stepper, generation animation, sticky generate (this PR)

- A 5-step stepper sits above the studio: Product, Brand, Idea,
  Arrange, Generate. The current step is highlighted, finished steps
  show a check, later steps read as locked until their prerequisites
  are done.
- While the final image generates or verifies, the canvas itself shows
  a blur + shimmer overlay with a status line ("Painting your finished
  ad…"); when the result arrives it reveals with a blur 12px → 0 and
  opacity 0 → 1 fade over 750ms. CSS only, no extra paid calls, and the
  site's global `prefers-reduced-motion` rule already disables both
  animations for users who ask for less motion.
- On screens ≤ 750px the generate button also lives in a fixed bar at
  the bottom of the viewport, so the user never has to scroll back to
  it; the in-flow button is hidden there, so exactly one generate
  button is ever visible or in the accessibility tree.

## Verification

- Lint 0 errors, `tsc` clean, unit suite 292/292, production build
  clean, one-shot E2E 18/18 on a local production build (6 tests × 3
  viewport projects), including a new test proving the stepper moves
  from current to done, the generating overlay appears during a
  delayed generation, and the result carries the reveal class.
- Production smoke after merge: `/api/health` 200, `/oneshot` 200,
  `/brands/new?returnTo=/oneshot` 200.

## Honest limits

- The generation animation is CSS only: it shows that work is in
  progress, it does not make the model faster.
- The stepper is an indicator, not navigation: steps do not jump the
  user to a section when tapped.
- The sticky bar duplicates the generate button in the DOM (one per
  viewport size); both share one action and one label.
- The one-shot mode still needs a Meta key and consent for every Meta
  call, by design.
- Build note, Oct 29: a Turbopack build once shipped new JSX with stale
  CSS (the new classes were missing from the production stylesheet),
  failing E2E on the hidden-button check. A clean rebuild
  (`rm -rf .next && npm run build`) fixed it; the gate now greps the
  built CSS for the new class names before running E2E.
- No paid calls were made by the implementation.

## Addendum — generation overlay overflow fix (Oct 29, 2026)

A phone screen recording during generation showed the blur area sliding
outside the screen. Cause: the shimmer layer was as wide as the canvas
and animated `translateX(-100%)` → `translateX(100%)` with nothing
clipping it, so the page grew ~239px wider than a 320px viewport while
generating (reproduced in E2E by sampling `scrollWidth` over a full
1.6s shimmer cycle). Fix: the canvas wrapper now clips
(`overflow:hidden`) and the shimmer is a narrow 40%-wide band sweeping
across inside the box, so no animated layer ever leaves the canvas.
Guarded by the same E2E sampling assertion on all three viewport
projects; one-shot E2E stays 18/18.
