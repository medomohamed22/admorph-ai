# Release report — Suggested fonts, mobile drag, logo keeps its place (Oct 29, 2026)

Three fixes from live phone testing of the one-shot build.

## 1. The planner suggests three fonts

- `planSchema` gained an optional `fonts` field (at most three family names).
  It stays `.strict()`, so a planner reply without fonts still parses and a
  reply with four fonts is rejected.
- The planner prompt asks for three headline Google Fonts families that fit
  the product and brand identity, most fitting first, chosen ONLY from the
  same fixed allowlist brand extraction uses (Latin + Arabic families).
  Anything outside the list is dropped client-side by the existing
  `resolveBrandFontFamily` resolver.
- The studio shows the suggestions as a picker under the ideas
  ("Suggested fonts"); picking one sets the headline font through the
  existing brand-font mechanism (Google Fonts stylesheet + `fonts.ready`
  before export). When the planner suggests none, the extracted brand font
  still applies. Uploading a new product clears the suggestions.
- Honest limit, unchanged from the brand-font round: the font is a mockup
  style hint, not a pixel guarantee in the final generated ad.

## 2. Dragging works on phones

Root cause, found by reading the canvas: the product, logo and icon images
render with `listening={false}`, and they were the only children of their
Konva groups. Konva hit detection is the union of listening children, so
those groups had NO hit area at all — taps and drags passed through to the
stage (which just deselects). Text elements worked because Konva Text nodes
listen by default. A second factor on phones: the canvas host had no
`touch-action` rule, so a touch drag became a page scroll.

Fix:
- Each image group now renders an invisible transparent `Rect` sized to the
  full element box behind the image. It is transparent, so exports and the
  model see nothing; it exists only for hit detection.
- `.design-canvas-host, .design-canvas-host canvas { touch-action: none; }`
  so a drag moves the element instead of scrolling the page.
- The explicit Enlarge/Shrink/nudge buttons stay as the precise alternative.
- Test proof: a drag test moves the product by (80, 60) logical units and
  asserts the layout the generate call actually sends (within 2 units of
  pointer rounding), plus a computed-style assertion that the host owns the
  touch gesture. An earlier version of the test failed on all three
  viewports because the canvas sits below the fold and raw mouse
  coordinates never reached it; the test now scrolls the canvas into view
  first.

## 3. The logo keeps its arranged position

No production change was needed here, and the report says so plainly: the
logo-replace code (`uploadLogo`, `applyBrand`) already preserved geometry
and only swapped the image blob — the logo only *seemed* to jump because it
could not be dragged at all (defect 2 above). This round proves the
behavior with a test: seed two brand kits, pick the first (logo appended at
830,40 200x80), click the logo on the canvas, nudge it 10px left, pick the
second brand, generate — and the generate call carries the logo at
820,40 200x80.

## Verification

- Lint 0 errors, `tsc --noEmit` clean.
- Unit suite 311/311 (38 files), including 3 new plan-font tests (parses
  with and without fonts; rejects four fonts).
- Clean production build; the built stylesheet was grepped for the new
  `touch-action` rule before running E2E.
- One-shot E2E 42/42 (14 tests x desktop / mobile / small-phone) on the
  local production build, including the three new tests above.
- Production smoke after merge: `/api/health` 200, `/oneshot` 200, plan
  route empty-POST 403 origin guard.
- No paid calls by the implementation. Live verification with a real key
  was not done for this round.
