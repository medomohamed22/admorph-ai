# AdMorph AI — Build log

Time zone for calendar entries: **Africa/Cairo**. Exact automated verification records use UTC. This log distinguishes completed work from future plans.

## 2026-10-26 — First recorded working baseline

**Completed**

- Milestone 1: Next.js foundation, English sample campaign, local rule demo, route shells and health route.
- Milestone 2: provider registry and catalog/test handlers, memory-only BYOK flow, model search/filters/roles, manual text fallback and error handling.
- Milestone 3: Dexie storage, complete current-screen Arabic/RTL, Brand Kit/logo/theme/export/import, optional encrypted credential storage and storage-failure handling.
- Release preparation: source-only GitHub/Vercel folder, Node 24 configuration, manual deployment guide, bilingual `/hackathon` page and CI workflow.

**Verification already recorded for the milestone-3 baseline:** lint/typecheck/build passed; 59 unit tests and 63 browser checks passed. See the dated milestone reports. Release preparation also passed 66 browser checks, fresh extracted-copy install/build, and a local production smoke at 2026-10-26T11:41:46.057Z. See `docs/archive/RELEASE_VERIFICATION.md` and `docs/evidence/production-smoke.json`. GitHub/Vercel remote publication remains owner-operated and has not occurred in this task.

**Live-provider boundary:** public OpenRouter catalog listing was checked without a key. Authenticated Meta/Gemini/provider generation is not claimed. No paid generation was executed.

The “Day” milestone labels above all refer to work recorded on 26 October. The original future calendar in `ADMORPH_BUILD_PLAN.md` is a tentative plan, not an execution log.

## 2026-10-26 — Campaign workflow update

- Added product upload/preview, Brand Kit snapshots, brief, goal, creative language and portrait format.
- Implemented a fixed-host Gemini planner using the saved Planner model, explicit file/brief consent, bounded structured responses and no automatic paid retry.
- Added three editable concept directions, individual approval, automatic approval invalidation after edits/input changes and preservation of previous concepts on failure/cancellation.
- Added local no-key templates, campaign restore/switching and an additive IndexedDB migration preserving existing data.
- Prepared general feature-based commit/PR text and a manual update packet against the previously prepared source baseline. No remote upload or deployment is claimed.

See `docs/archive/CAMPAIGN_UPDATE_VALIDATION.md` for the final checks. Gemini responses in automated checks are fixtures, not authenticated live-provider evidence. No paid AI request was executed during this update.

## 2026-10-27 — Editable studio and image-generation adapter

- Implemented Gemini background generation with explicit per-request consent, saved Image maker routing, raster validation, bounded responses/timeouts and no automatic paid retry.
- Added an explicit user-confirmed image model fallback for incomplete Gemini catalogs; known text-only/unavailable metadata cannot be overridden.
- Added separate Konva background/product/logo/text/CTA layers, drag/resize, fonts/colors/positions/order/visibility, session undo/redo, mobile panels and full-resolution PNG export.
- Added additive IndexedDB version 3 creative persistence with independent source image copies and honest storage-failure fallback.
- Added local no-key backgrounds and automated fixture/browser checks, including actual PNG dimension/content checks and touch dragging. See `docs/archive/STUDIO_VALIDATION.md` for final results.
- No authenticated paid provider request was executed. No GitHub packet, commit, PR or deployment was prepared or published in this phase, as requested by the owner.

## 2026-10-27 — Design checks and optional Critic

- Added automatic local checks for measured text clipping, bounds, required copy, image references, output dimensions, solid-fill contrast and geometric logo/headline overlap.
- Findings explain their evidence and limitations, support manual layer inspection, and update after edits in English/Arabic.
- Added an optional Gemini Critic using the saved Critic role, a separately consented reduced rendered preview and strict structured observations. No automatic paid requests/retries or fabricated performance scores.
- Added review persistence via additive IndexedDB version 4. Previous opinions become stale on layout/language changes, and late responses are fenced after edits/cancellation. Successful designs and earlier reviews are preserved on failure.
- See `docs/archive/CRITIC_VALIDATION.md` for final validation. No authenticated paid API request, automatic repair, Meta smoke request, GitHub packet/commit/PR or deployment was performed during this phase.

## 2026-10-27 — Approved repairs, comparison and Meta smoke adapters

- Added local measured repair proposals and an optional Gemini Edit-role proposal endpoint with separate preview-sharing consent. Strict actions, safe clamps and regression checks run before explicit application; no generated code or image replacement.
- Added real full-resolution before/after renders, atomic IndexedDB version 5 repair history and undo/redo that survives reload and protects later manual edits. Storage failures retain session-only recovery. Existing review fingerprints remain usable after property-order normalization.
- Added separate Meta chat/image smoke handlers with fixed synthetic prompts, model selection, explicit potentially billable consent, no automatic retries and secret-free evidence export. Automated tests use fixtures; no authenticated paid request ran.
- Current source is 0.7.0. See `docs/archive/REPAIR_VALIDATION.md` for checks. The numbered milestone was implemented on this actual date; it is not a separate calendar-day activity claim. No upload packet, commit, PR or remote deployment was prepared.

## 2026-10-27 — Three-design workflow and public BYOK behavior

- Added three independent offer/benefit/lifestyle composition templates, a saved campaign gallery, real previews and per-design PNG/caption downloads. Preparation reuses saved edits and owns image references; all-three writes are atomic, with an exportable session fallback on failure.
- Added direct editor switching, cancellation/fencing of late generation responses and current-canvas image-readiness checks. Mobile/RTL layout, touch targets and reduced-motion handling were improved.
- Added a global session key lock, stale-unlock protection, Settings privacy/status explanations and basic response headers. Projects, model roles and encrypted keys are preserved; no environment-owned key fallback or automatic paid request exists.
- Source 0.8.0. `docs/archive/DAY8_VALIDATION.md` records actual checks. No GitHub package, commit/PR, remote upload or Vercel deployment was prepared. Stop before final publication/submission work.
- Verification: 111 unit tests and 153 browser checks passed; the 15 gallery checks passed again after final RTL presentation adjustments. Lint/typecheck/build and production/development smoke checks passed, with no paid requests or browser exceptions.

## 2026-10-27 — Release preparation and real demo recording

- Source 0.9.0 adds release/submission documentation, neutral commit/PR wording, real local app screenshots and a captioned 69-second browser recording. Footage uses isolated sample data and no paid requests.
- Updated versioned source packaging, credential-pattern/path safeguards, per-file SHA-256 manifests and independently verified ZIP creation. Added source licensing and retained font notices.
- Expanded CI configuration to run browser regressions on the production build. Added a post-publication HTTP checker; configuration/local checks do not prove remote execution.
- `docs/archive/DAY9_VALIDATION.md` records final source/package checks. The owner's manual-upload choice remains in effect. GitHub/Vercel publication and organiser submission remain pending owner action; timestamps are actual preparation/check times, not nine separate development dates.
- Verification: 113 unit tests and 153 browser checks passed. A source ZIP was independently extracted, freshly installed and passed lint/types/113 unit tests/build plus production and three-design browser smokes on a separate local port. No paid API request or remote publication occurred.

## Remaining owner steps — not represented as completed

| Date / window | Planned work | Status |
| --- | --- | --- |
| Next owner-authorized provider session | Authenticated Meta/Gemini verification with suitable account access | Unverified; requires key and explicit request |
| After owner upload | Public-site/mobile QA and actual deployment review | Pending; local QA and demo recording completed on 27 October |
| 4 November | Final verification and submission preparation | Planned |

These dates can be revised as real progress is made; they do not certify future activity.

## Entry template for actual subsequent work

Copy this block only after doing the work and replace the fields with real values:

```text
Date (Africa/Cairo):
Completed change:
Actual commit SHA / repository link:
Checks run and results:
Local / fixture / live-provider distinction:
CI run link (if run):
Vercel deployment link (if deployed):
Remaining work:
```

Do not pre-fill future completed entries. Keep meaningful commits and actual CI/deployment records rather than relying on a dated Markdown statement alone.

## 27 October 2026 — Meta-only expansion, source 1.0.0

Integrated Meta-only runtime/settings, task-specific account receipts, smart logo placement, spatial presets, safe-zone/numbered review overlays, dialect copy, editable brand extraction, original-preserving product variants, image-edit gating, complete binary backups, KDF versioning, export preflight and recoverable versions. Existing project/provider data retained. Final local checks: 146 unit and 174 production browser tests passed, plus lint/types/build and local production smoke. Provider responses were fixtures; no paid Meta call, remote publication or backdated activity is claimed. See docs/archive/META_ONLY_VERIFICATION.md and its machine-readable evidence.

Development stability follow-up: scoped Tailwind discovery to application sources, stopping the release/build feedback loop. Dev-browser stability check passed with zero reloads, and the patched production build passed.

Meta models follow-up: corrected catalog timeout, fetched-model task selection, successful-test selection persistence and consistent exact model ID handling. 148 unit and 21 focused browser tests passed; types/lint and independent build passed. No paid Meta request.

Owner-requested direct Meta use: removed mandatory test/receipt gates in client and server for all tasks; added on-page model choices; kept explicit consent and keys. 148 unit tests and 6 direct-flow browser checks passed, plus types/lint/build.

## 2026-10-30 — Winning-plan features, one PR each

**Completed and merged into `main` (each deployed as a Vercel preview, then merged):**

- PR #75 — three fixed Meta models, dark design system, cleanup of unreachable screens.
- PR #76 — four-item navigation with **My gallery**; Arabic first visit for Arabic browsers; milestone reports moved to `docs/archive`; five stale E2E specs fixed.
- PR #77 — visible agent pipeline (seven step cards with model badges, timers, details, retry) and one critic-driven repair loop (`fixNotes`).
- PR #78 — one-shot becomes a five-step wizard with progress saved in IndexedDB.
- PR #79 — new home page (before/after hero, models strip, showcase driven by `public/showcase/showcase.json`).
- PR #80 — certificate card with score ring, **Why trust this ad?** panel, SAM cutout reveal.
- PR #81 — dialect picker for the copy (`dialect` on the plan request), colourful season cards, toasts.
- PR #82 — new README with the model table and pipeline diagram, a screen-matrix E2E spec (360–1440px, English and Arabic).

**Verification:** each PR ran lint (0 errors), `tsc`, unit tests, `next build` and the full Playwright suite against `next start` on desktop, 375px touch and 320px; every Meta route was intercepted. Schema changes (`fixNotes`, `dialect`) were also checked with direct HTTP requests to a freshly started local server, using deliberately invalid images so no request could reach Meta.

**Not done:** no paid or live Meta calls were made; real showcase ads, the demo video, demo mode with a server key and the per-platform canvas sizes (Status/Reels) remain open.

## 2026-10-30 — Live test, phase-2 plan and its batches

**Live test on the production site (owner's own Meta key, explicit consent for this run only).** Three ads were made from three owner photos (a sneaker, the TALJ can, headphones) through the wizard, followed by variants and an Eid seasonal copy. The key was used only at run time and was never written to a file or commit. Findings:

- The planner route timed out at 45 s → PR #83 raises the plan route to `maxDuration` 60 / 55 s server timeout / 65 s client timeout.
- The ads were good enough for the home showcase → PR #84 replaces the sample showcase with them and fixes the certificate ring overflow and the very tall remix pages.
- The painter sometimes wrote an invented brand name, and seasonal copies came back almost identical to the original → fixed in PR #85.

**Phase-2 plan, then one PR per batch (each merged into `main` after its Vercel preview passed):**

- PR #85 (batch A) — the prompt never asks for the brand name as text and lists the only words allowed. The critic reports `extraText` (each word costs 10 points and becomes a repair note) and, for seasonal copies, `seasonCues`. Seasons carry their own palette, props and light; a copy showing fewer than two cues is painted again. Seasonal copies start from the product cutout.
- PR #86 (batch D) — **Shoot the shelf, get a campaign** at `/shelf`. New routes: `shelf-detect` (vision) and `shelf-plan` (planner). Photo or video capture with a local sharpest-frame pick, live SAM cuts with a FLIP animation, review cards, one ad per product with critic review and one repair, ZIP and share, and rate-limit waits shown to the user.
- PR #87 (batch B):
  - The planner writes an art-direction brief per idea; the last five settings are kept and sent as `avoidScenes`.
  - 23 curated headline fonts with the weights they really ship (fixes single-weight families such as Bebas Neue failing to load).
  - Variants change one axis each.
  - It also added after-the-fact 1:1 and 9:16 frames, which were later replaced in PR #90.
- PR #88 (batch C) — canvas tools: layers panel, price, discount and button badges (`badge` on the layout element, told to the painter and checked by the critic), 12 icons, per-text style, snapping with guide lines, alignment, and a local flat-background remover for logos.
- PR #89 — the owner reported cutouts losing part of the product. The SAM code had not changed; Muse Spark's tight boxes were the cause. Boxes are now grown by 5%, with one 20% retry when the mask still runs into a box edge.
- PR #90 — on the owner's request the **ad size is picked before painting** (4:5, 1:1, 9:16): `format` on the one-shot request, a frame-aware canvas, checks and prompt; the after-the-fact frames and `/api/ai/oneshot-resize` were removed. A "Why trust this ad?" button repeated on the owner's phone during painting; the result actions now stay mounted while painting and the overlay drops its backdrop blur. This could not be reproduced in headless Chromium, so the fix is not yet confirmed on the phone.
- PR #91 — the intermittent Arabic E2E failures came from a real race: a language picked before the stored workspace finished loading was neither saved nor kept. Fixed in the workspace provider; a new E2E forces the race, failing before the fix and passing after.

**Verification:** every PR ran lint (0 errors), `tsc`, Vitest, `next build` and the full Playwright suite against `next start` (desktop, 375px touch, 320px) with every Meta route intercepted. Each schema change (`extraText`/`season`, `shelf-detect`/`shelf-plan`, `avoidScenes`, `badge`, `format`) was also sent as direct HTTP requests to a freshly started local production server: invalid bodies were rejected before any Meta call, and valid bodies with a fake key reached Meta and returned 401, so nothing billable ran. Final state after PR #91: 376 unit tests and 203 browser tests passed, 4 skipped, 0 failed.

**Not verified live:** everything merged after PR #84 (batches A–D, the SAM box padding, the size picker, the phone repaint fix) has only been tested with intercepted Meta routes. A new live run needs the owner's key and consent. The demo video is still open.

## 2026-10-30 — Second live run: every feature once, on production

With the owner's key and consent, every feature was run once on <https://admorph-ai-app.vercel.app> with real Meta models (72 requests, 11 of them refused by the app's own per-minute limit before reaching Meta). The key was used only at run time and never written to a file, log or commit.

**Worked first time:**
- **Wizard at 9:16:** a 1152×2048 story ad scored 85. It used an art-brief scene on the Nile Corniche, a price badge and an icon.
- **Brand reading, ideas with art briefs, the font picker, and the local transparent-logo button** all worked.
- **Shelf flow:**
  - detection found 3 products with their names and prices
  - SAM cut each one
  - the campaign was planned in Egyptian Arabic
  - 2 of the 3 ads scored 100

**Bugs found and fixed:**
- PR #93:
  - Muse Image PNGs over 3 MB were refused; they are now re-encoded under the response cap.
  - "Improve product" cut the improved photo with the text prompt only and threw the improvement away; it now uses the box path.
  - Price-tag fragments left in shelf cutouts are now removed.
- PR #94:
  - SAM sometimes returned the background inside the box (an inverted headphones cutout); the product mask is now chosen.
  - Variants failed on the per-minute limit; they now pause and retry.
- This entry's PR:
  - the built-in icon library is removed (owner's request; uploading your own icon stays)
  - variants and seasonal copies are written in the source ad's language, not the interface language
  - the cutout edge is pulled in and softened against the white halo
  - shelf labels stay inside the photo

**After the fixes, run again on production:**
- Improve product followed by the cut worked.
- The Ramadan copy (lanterns, crescent, dates) scored 100.
- Two variants scored 90 and 100.
- The shelf campaign: 3 ads at 100, with a correct headphones cutout.

**Still open:** the repeated "Why trust this ad?" seen on the owner's phone was not reproducible here, so its fix is unconfirmed on a phone.


## 2026-11-02 — Speed and reliability pass (PRs #112 and #113)

**Owner report:** the "three ideas" step counted many seconds and sometimes ended with "the response reached its output limit" or another error, so ideas needed several tries. Seasons, variants and the shelf were sometimes slow or produced a wrong ad.

**Measured on production before the fix:**
- 20 live idea requests: 3 failed.
  - one cut off (`plan_truncated`)
  - one timeout at 55 s
  - one `invalid_response`
- Successful runs took 14–45 s (median 27 s).
- In 3 of 17 the optional art brief was skipped for a 1000-character paragraph.
- The guided demo: 8/8 steps in 175 s.

**Causes:**
- The planner schema allowed far more text than the studio uses, so a wordy answer hit the 4096-token cap.
- The art brief was optional.
- One bad field failed the whole answer.
- A season asked for three ideas and used one.
- Copies and shelf ads were painted one at a time.
- Variants had no repair.
- Seasonal and variant copies sent the cutout with a transparent background, which the painter reads as black: a white sneaker came back black in two of three variants.
- An oversized painted PNG was re-encoded at the slowest level (3.3 s).

**Fixes:**
- A lean planner answer with a required art brief, sized to fit the cap.
- Safe trimming before validation, and one retry for a cut-off or malformed answer, with logging of the failing fields.
- One idea per season.
- One repair with the reviewer's notes for variants and seasons.
- Parallel painting with the site key: three lanes.
- The cutout sent on a light background, like the one-shot close-up.
- A fast lossless PNG level.
- Clearer messages.

**After, on production, the same 20 idea requests:**
- 20/20 succeeded.
- 8.9–28.2 s (median 20.5 s, mean 18.6 s, was 28.9 s).
- Every answer had its art brief.

**Demo and variants:**
- The guided demo: 8/8 steps in 185 s, which included a repair on the one-shot ad and on the Ramadan copy. The two shelf ads were painted side by side.
- Three variants: 66 s including two repairs.
- The black-sneaker finding came from that variants run and is fixed in PR #113.
- **Final run on production after #113:**
  - Guided demo: 8/8 steps in 212 s.
    - Ideas took 11.2 s.
    - Two shelf ads were painted side by side, plus one repair.
    - Single paints took 14–27 s on Meta's side.
  - Three variants of the white-sneaker ad: 46 s, scores 100, 90 and 100. The sneaker stayed white in all three, and no repair was needed.
  - The total demo time did not drop. It is mostly painting time, which varies on Meta's side, plus any repairs. The gains are in reliability, ideas time and parallel copies.

## 2026-11-02 — Copies keep logo and icon places; reviewer-reported page fixes

**Copies (seasons and variants):**
- A one-shot ad now saves where its logo sat (one of nine zones of the canvas) and up to two of its icons with their zones.
- Copies paint the logo and icons back in the same zones, sent as extra images after the product. If Meta refuses the extra images, the copy falls back to the logo alone, then to the product alone.
- The reviewer checks that the logo is in its zone and readable. A logo that blends into a dark or light scene now fails the check and gets a repair.
- A new contrast rule (for the painter, in copies and in one-shot ads): keep a mark readable with a lighter or darker spot or a small backing panel, and never recolor the mark itself.

**Page fixes from a reviewer's run:**
- Themes and variants say "Loading your saved ads…" until the gallery is read, and retry a failed read; the newest ad starts picked.
- The site-key check retries with a growing wait, so a slow start or a firewall answer no longer reads as "AI is not set up". That banner shows only after a real "no key" answer or repeated failures.
- Disabled Generate and "Suggest 3 ideas" buttons now say why (connecting, reading the brand kit, brand missing, no ad or season picked).
- A saved Arabic choice is applied before the page shows, so a reload no longer shows English first and then flips to Arabic. The choice is mirrored to a two-letter localStorage value for this.

## 2026-11-02 — Judge-facing accuracy pass

- The `/hackathon` page and `HACKATHON.md` said live Meta verification was pending and that image generation had not been shown with a real key. They now describe what runs today, the planned "Coming soon" items, and say plainly that the fidelity score is Muse Spark's own judgment.
- "Your key" wording is gone from Settings and the shelf page: visitors use the site's key and never enter one.
- The tab title follows the interface language on every page (Arabic titles were English).
