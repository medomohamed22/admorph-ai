# Auto-ads release report

Baseline: `5f8b5da` (main after audit PR #4, 2026-10-27).
Program: PR0–PR6 of the auto-ads implementation, merged in order.
Production: https://admorph-ai-app.vercel.app
Hackathon submission: NOT submitted.

## What shipped

One no-key auto-ads flow, enabled by default from the main navigation
("Auto ads" → `/auto-ads`):

- PR0 — baseline and docs (`PR #5`, `081d7c2` → main `8eb4c53`):
  plan document, sample fixture, stale sample copy fixed.
- PR1 — local product cutout (`PR #6`, `b599042` → main `a7c58e0`):
  pure border-median segmentation, cutout tool page, Dexie `cutout`
  asset kind. Meta SAM adapter intentionally absent: the Meta task
  catalog has no `segment` task and no endpoint was guessed.
- PR2 — BackgroundBrief and background-only generation (`PR #7`,
  `f1dacd6` → main `ba9a45e`): strict brief schema with no image field
  by design, deterministic brief builder, brand-color local gradient,
  both background request schemas accept the brief and stay strict
  (an `image` field is rejected).
- PR3 — compositor correctness (`PR #8`, `048425e` → main `fb3215c`):
  transparent text fills, brand fonts (Inter/Cairo), contain-fit math,
  font-aware PNG export at exactly 1080×1350.
- PR4 — single-run orchestrator, no-key mode (`PR #9`, `02ad646` →
  main `655f2f9`): six local steps (cutout, analysis, backgrounds,
  composition, copy, review) under one combined consent, progress,
  cancel, retry from the failed step, past runs, Dexie `autoRuns`
  table (schema version 7, additive only).
- PR5 — results, captions, regenerate, ZIP (`PR #10`, `cc2ee7f` →
  main `988f060`): hero plus up to three variants, three local tagline
  candidates from user words only, per-result captions (max 1200
  chars, editable, copyable, TXT download, apply-to-all),
  background-only regenerate from deterministic local variants, and a
  dependency-free stored-ZIP writer (PNG + caption TXT per result).
- PR6 — integrity, E2E, release (this PR): pixel-level product
  preservation check (opaque cutout pixels must carry the original
  RGB), provenance/structure checks, quality labels (Verified /
  Warning / Not checked / Modified), Playwright E2E for the no-key
  flow, and production smoke coverage for auto-ads.

## Verification

- Lint: 0 errors (warnings are blob-preview `<img>` notes only).
- Typecheck: clean.
- Unit suite: 19 files / 189 tests, all passing (PR6 adds the
  integrity suite: pixel preservation, provenance, labels).
- E2E (`tests/e2e/auto-ads.spec.ts`, desktop + mobile + small-phone
  projects, 15/15 passing): no-key run with zero Meta/provider API
  calls (routes aborted and counted), reload reopening,
  background-only regenerate keeping product/text/caption and
  marking the result Modified, caption TXT and set ZIP contents,
  invalid-product failure with retry, and an Arabic RTL run
  exporting a 1080×1350 PNG. Fixed during E2E: the caption
  textarea's wrapping label polluted its accessible name with the
  caption value, so it is now linked with htmlFor/id.
- Production smoke (`npm run test:production` against the live
  domain): home, hackathon EN/AR, brand/campaign/studio flows, API
  origin and consent guards, plus a no-key auto-ads run with a
  Verified quality label and a ZIP download.
- Real HTTP check (PR4): a valid background brief with a dummy key
  returned Meta 401 (validation passed, no paid usage); a malformed
  brief returned 400 validation. The brief-aware route works against
  the real server, not just mocked tests.

## Meta status (honest)

- SAM: UNAVAILABLE — no `segment` task in the Meta catalog, no
  endpoint guessed, no SAM adapter shipped.
- Meta planner / image / critic: NOT live-verified — no paid calls
  were made, no key was entered. The routes exist and parse correctly
  (see the 401/400 check above); generation itself was never run
  against Meta.
- Everything the auto-ads flow does today runs locally in the
  browser at zero cost and sends nothing to any service.

## Known issues

- The ZIP renderer waits up to 5 seconds per result; a slow device
  may skip a PNG (its caption is still included, with a note).
- Quality label shows "Not checked" until the pixel comparison
  finishes (fast, local).
- A language switch that lands before the provider's initial
  settings load resolves can be overwritten by that load
  (pre-existing provider race, not introduced by this program);
  the Arabic E2E test retries until the switch sticks.
- E2E and production smoke pin Google Chrome (`channel: 'chrome'`);
  local runs in this environment used Playwright's bundled Chromium
  with the same script and spec, because Google Chrome is not
  installed here.

## Rollback

Last known-good before the program: `5f8b5da`. Per-PR rollback
targets: PR0 `5f8b5da`, PR1 `8eb4c53`, PR2 `a7c58e0`,
PR3 `ba9a45e`, PR4 `fb3215c`, PR5 `655f2f9`, PR6 `988f060`.
