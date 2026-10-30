# Smart-fix program release report

Baseline: `22ce8c2` (main after quality program PR #19, 2026-10-28).
Program: smart-fix PR-1–PR-8, approved by the owner 2026-10-28
(8-point plan, no point vetoed; the plan's point 7 auto text-color
adjustment was explicitly invited for veto and kept).
Merged in order: PR #21–PR #27 plus this release PR.
Production: https://admorph-ai-app.vercel.app
Hackathon submission: NOT submitted.

## Why this program exists

A second live test (2026-10-28, TALJ demo brand, owner's own Meta key)
found eight real problems the quality program had not covered: the API
key was wiped by any full page reload; a vision analysis hung for nine
minutes with no error; the first live reference generation failed; the
template select never confirmed the applied layout; a successful cutout
never said which method produced it; a dark background made a black can
and black text invisible with no review catching it; the can stayed
small; and Arabic text forced to LTR passed the critic silently. Every
fix below answers one of those problems, and none of them weakens the
standing rules: product pixels stay untouched, Meta calls stay
consent-gated, no paid call was made by the implementation itself, and
no Sketch2UI code was imported.

Two corrections from that live test are recorded here because they
changed the plan. The consent checkbox resetting after "Fetch models"
is by design (consent is single-use per request) and was not changed.
The Arabic-in-LTR ad was caused by the test itself (it set LTR
explicitly), not by auto-detection — but it exposed the missing critic
rule, which PR-7 adds.

## What shipped

- PR-1 — key persistence (`PR #21`, main `75b36db`): the encrypted
  vault already existed but lived inside a collapsed settings section,
  so it was undiscoverable. It now auto-opens exactly when it matters:
  a saved key with an empty session prompts an unlock, and a fresh key
  with no saved copy surfaces the Remember action. SPA navigation
  already preserved the key; full reloads now need one passphrase
  unlock instead of retyping the key. Plaintext keys are never stored.
- PR-2 — vision watchdog (`PR #22`, main `cea1588`): a 65s watchdog
  guarantees the Analyze button re-enables with a clear timeout message
  even if the request hangs, and the error now renders inline under the
  Analyze button (the global banner stays). The original nine-minute
  freeze cause is still undetermined — the studio already used a 55s
  abort signal and a finally that clears the busy state, so the freeze
  is unexplained by the code; the watchdog is the honest mitigation.
- PR-3 — reference/edits diagnosis (`PR #23`, main `e874ba4`): the
  reference route no longer rejects every non-base64 envelope. Strict
  base64 stays first; a provider URL is now fetched and validated
  server-side (https only, no localhost or private ranges, bytes and
  dimensions checked, never handed to the client); anything else yields
  the new `image_shape` error carrying only response-shape key names,
  never content. This refines the old "no provider URLs" policy: URLs
  are never returned to the client, only fetched server-side.
- PR-4 — template confirmation (`PR #24`, main `4a89c8b`): the applied
  template is stored on the creative and the select shows it, plus a
  "Current layout" line, instead of silently resetting to the
  placeholder. Found while testing: a reload inside the 400ms save
  debounce dropped the edit, because the flush only ran on manual
  Save-now / concept switches. The studio session now also flushes on
  pagehide (reload/close) and on unmount (client-side navigation). The
  guaranteed contract is that once the save indicator shows Saved, a
  reload keeps the edit; a reload racing the flush commit is still
  best-effort, and the E2E asserts exactly that.
- PR-5 — cutout method indicator (`PR #25`, main `8654d85`): the
  studio status line now shows which method produced the applied
  cutout (Meta (SAM) cutout / Local browser cutout, reusing existing
  messages), cleared when restoring the original photo and when
  switching concepts. The note is per-session: a cutout from an earlier
  session shows no method, because the method is not stored on the
  asset (storing it would need a database schema change).
- PR-6 — pixel post-background review (`PR #26`, main `8dc240b`):
  after every applied background (Meta or local), the studio measures
  real pixels — product vs surrounding background, and each
  transparent-fill text layer vs the background behind it (pure,
  unit-tested pixel core plus a canvas adapter). Two fixes apply
  automatically in one undoable update: the product layer follows the
  vision scale rect, and unreadable text moves to the lightest brand
  color, both with a visible note. The review box also offers a
  Lighten background grade repair when the product still blends in
  (the grade sits above the background and below the product, so it
  cannot wash the product out). The old contrast rule only compared
  text color vs text-box fill, which is why black-on-dark passed.
- PR-7 — direction-mismatch rule (`PR #27`, main `43d7937`): the
  critic now warns when an Arabic-script layer is forced LTR (or Latin
  forced RTL). Auto direction and directionless text (digits,
  punctuation) never trigger. The local repair engine proposes resetting
  the direction to automatic (new `set_direction` action, text layers
  only, verified no-regression) through the existing one-click fix
  flow.
- PR-8 — this release PR: this report, the README section, and the
  grade-repair E2E (the PR-6 grade button path, previously covered only
  by the review box assertion).

## Verification

- Unit suite: 253 tests, 30 files, all passing (pixel core 4, direction
  rule and repair cases included).
- E2E on a local production build, desktop / mobile / small-phone:
  key-persistence, vision-timeout, template-confirmation,
  cutout-method, background-review, direction-mismatch and
  grade-repair specs all pass; the quality suite (15/15) still passes.
- Production smoke per PR: GET /api/health and GET / return 200; new
  routes answer 403-origin (origin guard), never 404.
- No paid calls were made by the implementation in any PR.

## Honest not-verified list

- First live SAM cutout: still unconfirmed (the studio cutout completed
  in the live test but the UI showed no method note before PR-5; a live
  run with the owner's key would now show it).
- Live reference generation retest: PR-3 changes the parsing, but
  whether the original failure was the URL shape is still unconfirmed
  until a live edits call runs with the owner's key and consent.
- Live vision-scale product resize and live Meta-background review:
  PR-6's resize and review are E2E-verified on local backgrounds only;
  the Meta path needs the owner's key at test time.
- The original nine-minute vision freeze cause: undetermined (see
  PR-2); the watchdog bounds the symptom.
- Demo video and hackathon submission: not done. The submission itself
  needs the owner's approval only, and HACKATHON.md still carries a
  "not verified" line for vision that is now outdated (vision and the
  vision-first background were live-verified 2026-10-28); updating that
  line needs a separate owner approval.
