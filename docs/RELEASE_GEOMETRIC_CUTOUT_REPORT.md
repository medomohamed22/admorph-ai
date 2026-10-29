# Geometric SAM cutout — release report (Oct 29, 2026)

## The failure it fixes

The diverse-product test (Oct 29, 2026) proved the old cutout path was
fragile at its root: 5 of 6 products — phone, earbuds, headphones, watch,
sneaker — failed at "Isolate background" with `sam_no_mask`, twice each,
while the perfume bottle and every TALJ can cut fine. The cause was not
the photos: the cutout sent SAM one word, "product", and SAM's
open-vocabulary text grounding either grounds the word or returns zero
mask records. PR #43 had already shown the outcome is hypersensitive to
wording (a longer prompt flipped every live run to zero masks). One word
carried the whole feature.

## The fix: geometric prompts

The isolate step now asks geometry questions instead of language ones,
in this order:

1. **Vision box (new `POST /api/ai/product-box`).** The vision model
   returns the main product's bounding box as fractions of the image
   (`productBoxSchema`: each side 0..1, right > left, bottom > top).
   The client fits the photo under the 2 MiB server cap first, exactly
   like every other vision call.
2. **SAM box prompt.** The box becomes a box prompt built with the
   parser's own `buildObjectPrompt` formatter (`<0f>1<|box;…|>`). SAM
   segments what is inside the box without needing to name the object,
   so the failure class — "could not ground the word" — disappears by
   construction. This is SAM's native prompting mode, not a workaround.
3. **Noun-phrase fallback.** If box detection fails or the box cutout
   throws, the old `"product"` text prompt runs once.
4. **Tap-to-cut.** If text also fails with `sam_no_mask` (or
   `invalid_response`), a panel shows the original photo: tapping the
   product sends the tap point as SAM's prompt. Taps can be retried;
   the panel hides on success, on a new upload, or via its Hide button.

The segment route accepts exactly one prompt kind per request — noun
phrase, pixel box, or pixel point, each with its image size — and
rejects mixed or sizeless requests (an object prompt must never combine
with a noun phrase). The client converts vision fractions to half-open
pixel boxes (clamped inside the image, never empty) with pure helpers
(`boxFractionsToPixels`, `pointFractionsToPixels`).

## Scope decisions

- The enhance switch keeps the old text cutout path: its re-cut after a
  makeover is unchanged, so this program cannot regress it.
- No local-cutout revival: one-shot stays SAM-only, as ordered. A
  failed automatic cutout now has a manual rescue (the tap) instead of
  a silent fallback.
- Cost: the normal box-first flow costs vision + SAM (2 calls) instead
  of the old single SAM call; that is the price of never betting on one
  word. A product that fails the box costs one more (the text fallback),
  and a tap costs one more after that.
- Known limit, stated openly: a transparent glass edge can still be
  rough even inside a correct box — but the box path returns a mask
  where the text path returned none.

## Verification

- Unit: box/point wire text (`<0f>1<|box;`, `<0f>1<|point;`), rejection
  of mixed/sizeless requests, product-box route, fraction conversion
  (including clamping and the degenerate-box guard).
- E2E: a shared full-frame product-box intercept keeps every existing
  isolate test on the new path; two new tests prove the rescues — the
  box cuts a product whose noun phrase is forced to fail, and the tap
  cuts a product whose box and text are both forced to fail.
- Live verification with a real key on the five failed products is
  still open at this writing: it needs the owner's key again, and it is
  the step that proves the fix rather than the tests.
