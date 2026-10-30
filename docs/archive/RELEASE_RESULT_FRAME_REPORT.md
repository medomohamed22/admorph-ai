# Result frame, canvas controls and brand fonts (Oct 29, 2026)

## What changed

1. **Persistent result frame.** A `result-frame` section sits between the
   canvas section and the generate controls on `/oneshot`, so it is visible
   from page load, above the generate button (in-flow and sticky). Before
   the first generation it shows an empty dashed frame with the
   `resultEmpty` note; while `busy` is `generate` or `verify` it shows the
   same blur/shimmer overlay (`oneshot-generating`) that used to sit on the
   canvas — the canvas itself now stays sharp during generation; after
   generation the finished image fades in inside the same frame
   (`oneshot-reveal`), with the download link and the fidelity certificate
   beneath it. The frame is `aspect-ratio: 4/5`, `overflow: hidden`, so the
   shimmer band stays clipped (the 2s max-overflow sampling guard moved
   with the overlay and still passes on all three viewport projects).
2. **Explicit canvas controls.** When an element is selected, a button group
   (`selectedControls`) offers Enlarge (x1.2), Shrink (x0.8) and four 10px
   nudge arrows. Resizing is the pure helper `scaleOneshotElement`
   (center-preserving, aspect-preserving, capped at the 1080x1350 frame and
   floored at 24px, canvas-only fields preserved); nudging reuses
   `clampOneshotElement`. Drag and corner handles still work unchanged.
   The E2E controls test proves the buttons change the layout the generate
   call actually sends (800x120 text at (140, 500) becomes 960x144 at
   (50, 488) after one enlarge and one left nudge).
3. **Brand fonts.** `extractedSchema` gained an optional `fontFamily`; the
   vision extraction prompt asks the model to pick one Google Fonts family
   from a fixed allowlist (`src/lib/brand/fonts.ts`: 7 Latin families, 5
   Arabic families) matching the wordmark, or omit it. The studio resolves
   the answer case-insensitively against the allowlist
   (`resolveBrandFontFamily`), loads the stylesheet from Google Fonts once,
   redraws the canvas, and applies the family to the headline element only
   (canvas falls back to Cairo/Inter for missing glyphs); `generate()`
   awaits `document.fonts.ready` before exporting the mockup so the model
   sees the brand font. The font is stripped from the server layout
   (`toServerLayout` drops `fontFamily`) and shown as a `brandFont` line
   under the brand picker.

## Honest limits

- The font is a style hint carried by the mockup: the image model redraws
  the headline in its own hand, so an arbitrary downloaded font is not a
  pixel guarantee in the final ad. Exact-font guarantee would need the
  headline drawn over the finished image (like the phone pin) — not built
  here.
- The font lives in the studio session (set by extraction only); it is not
  saved onto brand-kit records, so picking a saved kit does not change it.
- Font loading needs network access to Google Fonts; offline it fails
  silently and the headline falls back to Cairo/Inter.
- This round was verified with intercepted Meta routes only (no paid
  calls); a live run with a real key is still the proof for the font in a
  real generated ad.

## Verification

- Lint 0 errors, `tsc --noEmit` clean, unit 299/299 (35 files, incl. 4 new
  scale tests and 3 new font tests), clean rebuild with the built CSS
  grepped for `result-frame`, one-shot E2E 24/24 (8 tests x 3 viewports,
  incl. the new font and controls tests and the extended stepper test).
- No paid calls by the implementation.
