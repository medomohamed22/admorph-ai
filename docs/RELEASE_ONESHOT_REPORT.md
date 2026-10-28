# One-shot ad mode (Oct 28, 2026)

A new mode alongside the layered studio editor (which is untouched): the
user arranges a finished ad on a mockup canvas, and one Meta images/edits
call paints it. The differentiator is user-directed layout: the user picks
where everything goes, instead of describing positions in a prompt.

## Flow (`/oneshot`)

1. Upload a product photo (+ optional logo). The product is cut out with
   the same SAM-first/local-fallback cutout as the studio, with a visible
   method line.
2. Brand fields, optionally extracted from the product photo (vision), and
   three planner ideas; picking an idea sets the headline and the scene.
3. The mockup canvas: drag/resize the cutout product, logo, headline,
   extra text lines, a phone number, and uploaded icons — by touch or
   mouse, with keyboard nudging. Selected text is editable in place.
4. Enhance switch (optional): a Meta makeover in enhance-only mode improves
   the original photo's materials/lighting, then the product is re-cut; any
   failure keeps the original cutout. Shape, packaging and writing are
   preserved by the strict enhance prompt.
5. Generate: the 1080x1350 mockup is exported, fitted under the 2 MiB
   server input cap, and sent to `POST /api/ai/oneshot` with the brand, the
   scene idea, and the layout JSON. The prompt pins every element to its
   mockup zone and quotes every text/phone string exactly.
6. Phone pin (on by default when a phone element exists): the exact digits
   are drawn onto the result with canvas text, so a phone number is never
   trusted to the model alone.
7. Fidelity certificate: `POST /api/ai/verify-oneshot` (vision) checks the
   result against the mockup — product kept, logo kept, layout kept, and
   every text's expected-vs-found match — and scores it (product 40 /
   layout 20 / logo 15 / texts 25). The result downloads as PNG; one-shot
   results are not stored in the layered studio.

## What is new

- `src/lib/ai/oneshot.ts`: layout schema (1080x1350, max 12 elements),
  zone words, the one-shot prompt builder, the certificate schema, the
  score helper, canvas clamp/strip/default-layout helpers.
- `src/app/api/ai/oneshot` (image_edit, 60s maxDuration, 55s timeout) and
  `src/app/api/ai/verify-oneshot` (vision, same limits).
- `src/components/oneshot-canvas.tsx`: the draggable mockup canvas with
  PNG export at full 1080x1350.
- `src/components/oneshot-studio.tsx` + `src/app/oneshot/page.tsx`: the
  page flow above; header nav link; `oneshot` messages in both locales.

## Verification (no paid calls by implementation)

- `npx tsc --noEmit` clean; eslint 0 errors; full unit suite 288/288
  (13 new oneshot tests); `npm run build` compiled successfully.
- `tests/e2e/oneshot.spec.ts` passes on a local production build with both
  Meta routes intercepted: it proves the arranged mockup and its layout
  reach the server and the certificate renders with score 100 on the
  fixture.
- Production smoke after merge: `/api/health` 200, `/oneshot` 200, both new
  routes answer 403 `origin` on an empty POST (origin guard proves they
  exist).

## Honest limits

- Layout preservation is a strong hint from the mockup image, not a pixel
  guarantee: the model may nudge or resize an element. The certificate is
  the guard — regenerate when it reports drift.
- The mockup sheet is neutral grey so positions stay legible; the model
  paints the real scene over it.
- The certificate is a vision model's judgment, not a measurement: it can
  misread small text. The phone pin exists precisely because digits must
  not depend on that judgment.
- Live verification on Meta `muse-image-1.0` with a real key has NOT run
  yet: in-chat tests proved the concept on a different pipeline, and this
  build proves the wiring with fixtures. The first live run needs the
  owner's key and may surface model-specific layout behavior.
- Blank text boxes are filtered from the server layout (they render
  nothing on the mockup and must never become quoted empty strings).
