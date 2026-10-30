# SAM fix program — release report (Oct 28, 2026)

Follow-up to the one-shot live test of Oct 28, 2026 (~21:23): the test
succeeded with certificate 100, but the cutout was local for the third
consecutive live run, and the enhance switch showed no visible result.
This program fixes both, with no paid Meta calls made by the
implementation itself.

## What was actually wrong (found by code inspection)

1. **The segment route had the vision bug, unfixed.** `/api/ai/segment`
   ran on the 45s default server timeout with no `maxDuration`, while SAM
   through the Responses API can take longer. Vision had exactly this bug
   and was fixed in PR #29; segment never got the same treatment. A slow
   SAM call was therefore aborted server-side.
2. **The one-shot page swallowed every SAM error.** `runCutout` wrapped
   the SAM attempt in a bare `catch` and silently fell back to the local
   cutout, so the real error (timeout, Meta error, empty mask) was never
   shown — which is why three live runs in a row reported "local" with
   the cause "undetermined".
3. **The enhance switch had two UI bugs.** Toggling it on with no model,
   key or consent silently did nothing (consent resets after every Meta
   request, so this is easy to hit), and a successful enhance set no note
   and no visible marker — on an already-clean studio photo the enhanced
   result looks identical at canvas scale, so the user could not tell
   anything happened.

## What changed

- **PR #49 — segment timeout.** `/api/ai/segment` now passes
  `{ timeoutMs: 55000 }` with `export const maxDuration = 60`, mirroring
  the vision fix. This benefits every SAM caller (studio, swap,
  cutout-tool, one-shot) without changing their behavior.
- **PR #50 — one-shot cutout is SAM-only.** `runCutout` throws when SAM
  is unconfigured (new `sam_unavailable` error code, mapped in both
  locales) or when the SAM call fails, with a 65s client timeout matching
  the other one-shot calls. The cutout-method line only ever shows Meta
  (SAM). Toggle-off restore is wrapped so a SAM failure there shows the
  error instead of an unhandled rejection.
- **PR #51 — enhance shows its result.** A blocked toggle now shows a
  note explaining what is missing; a successful enhance shows a success
  note plus a small original-vs-improved preview under the switch.
  New message keys in both locales.
- **E2E.** `tests/e2e/oneshot.spec.ts` now seeds the segment role and
  intercepts `/api/ai/segment` with a full-opaque mask fixture, asserting
  the SAM method line; a second test proves the enhance note + preview
  (makeover and segment both intercepted).

## Scope note (deliberate)

Local cutout removal applies to the **one-shot page only**. The layered
editor keeps its local fallback because the no-key demo mode depends on
it. One-shot already requires a Meta key for generation, so SAM-only
there costs nothing.

## Verification

- Lint 0 errors, `tsc` clean, unit suite 288/288, build clean.
- One-shot E2E 6/6 (both tests × desktop/mobile/small-phone) on a local
  production build.
- Production smoke after each merge: `/api/health` 200, `/oneshot` 200,
  `/api/ai/segment` 403 `origin` on empty POST (route exists).

## Honest limits

- The timeout fix addresses the most likely cause of the live SAM
  failures, but a server timeout cannot be proven by a fixture test —
  **the proof is the live retest with a real key**, which is the planned
  next step. If SAM still fails live, the failure will now surface as a
  visible error with its real code instead of a silent local cutout.
- The enhance preview compares the photos before cutout; a subtle
  makeover on an already-clean photo can still look near-identical.

## Addendum — precise SAM diagnostics (same day, after the retest)

The first live retest after PRs #49–#52 failed at the cutout with the
generic `invalid_response` message — twice, on the same blue can. That
message hid two different failures (Meta's reply had no text lane, or
its text parsed to zero mask records), so the diagnosis now names the
sub-cause:

- `sam_no_text`: Meta's Responses reply carried no `output_text` lane;
  the server attaches the envelope's top-level key names (never content)
  for the log.
- `sam_no_mask`: the reply's text parsed to zero mask records; the
  server attaches the parser's diagnostic codes.
- The browser SAM client now preserves the server's error code +
  details instead of dropping them, and its own empty-mask case throws
  `sam_no_mask` with an explanatory detail.

Unit tests prove both server paths plus the client's error-body mapping;
a third one-shot E2E proves the no-mask message appears on upload
instead of a generic error. The next live run will therefore report
exactly which sub-cause failed, which is what the retest needs.

## Addendum 2 — SAM prompt reverted to `product` (same day)

The diagnostics retest failed twice with `sam_no_mask`: Meta's reply
had a text lane but zero mask records. Git history showed the timeline:
before PR #43 the studio sent the single word `product` and SAM worked
live (including the same blue can); PR #43 replaced it at all call
sites with a longer "excluding props/garnish/..." wording, and every
live SAM run since has returned zero masks. Same photo, same account,
different prompt — so the prompt was reverted to `product`. Trade-off,
stated openly: the prop-exclusion benefit is lost, but the PR #43
bottom-roughness detector still warns when a cutout bottom looks torn.
Whether the revert restores live SAM can only be proven by the next
live retest with a real key.
