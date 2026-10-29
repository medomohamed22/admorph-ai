# Release note — Phone-number pinning removed (Oct 29, 2026)

## Why

The finished ad already contains the phone number: the mockup layout
carries the phone element, and the image model paints it. The pin step
then drew a second copy of the same digits on top of the result at the
mockup position. Layout preservation is a strong hint, not pixel-exact,
so the model's digits never sit exactly on the mockup box — the two
copies ghosted over each other and ruined the image. The user's report
("it comes out on top of the old one and ruins the image") matches this
mechanism exactly.

## What changed

- The `pinPhoneText` compositing step is gone: the generate call's
  result is now used exactly as the model returned it.
- The "Pin the phone number exactly" checkbox, its state, and its
  message key (both locales) are removed. There is no pin toggle anymore.
- The phone element still exists on the canvas and in the layout the
  model sees, and the vision certificate still reads the digits back and
  reports a mismatch as a failed text check.

## Honest trade-off

Removing the pin removes the ghosting, but it also removes the only
exact-digit guarantee: a phone number is now fully model-painted. If the
model garbles a digit, the certificate will say so (failed text check)
instead of silently fixing it. That is the correct behavior for a
verifiable product — a wrong digit must be visible, not papered over —
but it means a garbled phone number now requires a regenerate, not an
automatic repair.

## Verification

- Lint 0 errors, `tsc --noEmit` clean.
- Unit suite 318/318 (no pin-specific tests existed).
- Clean production build.
- One-shot E2E 45/45 (15 tests x desktop / mobile / small-phone) on the
  local production build.
- Production smoke after merge: `/api/health` 200, `/oneshot` 200.
- No paid calls by the implementation. Live verification with a real key
  was not done for this round.
