# Quality program release report

Baseline: `5f8b5da` (main after auto-ads PR #4, 2026-10-27).
Program: quality-fix PR-A–PR-G, approved by the owner 2026-10-27
(8 fixes, with two binding modifications: studio auto-cutout must use
SAM, not the local cutout; background generation must be vision-first).
Merged in order: PR #13–PR #18 plus this release PR.
Production: https://admorph-ai-app.vercel.app
Hackathon submission: NOT submitted.

## Why this program exists

A live test ad (2026-10-27, TALJ demo brand, owner's own Meta key)
showed five real defects: the generated background contained a product;
the product kept its old background in one concept; the copy was
inconsistent; Arabic/English text direction was wrong; the ad did not
look professional. Every fix below answers one of those defects, and
none of them weakens the standing rules: product pixels stay untouched,
Meta calls stay consent-gated, no paid call was made by the
implementation itself, and no Sketch2UI code was imported.

## What shipped

- PR-A — SAM studio auto-cutout (`PR #13`, main `f9688d5`):
  product segmentation is a first-class Meta task (`sam-3.1` via the
  Responses API, official `@meta-sam/parser` package). The studio cuts
  the product out automatically when a fresh creative is opened, reuses
  a library cutout when one exists, and falls back to the local cutout
  with a visible note when SAM fails. The local border-median cutout
  stays for the cutout tool page, because it fails on rich backdrops
  (the TALJ photos proved it) and the user must see that failure, not
  have it hidden.
- PR-B — vision-first backgrounds (`PR #14`, main `fb732d4`):
  the vision model analyzes the product (category, material, mood,
  lighting, scale) and proposes three scenes; the background brief is
  built from the chosen scene with strict negatives (no cans, no
  bottles, no containers, no objects, no text, no logo). After
  generation, a vision re-check looks for a product in the background;
  a positive detection regenerates once with stricter negatives, and
  blocks the background if it is still present. The check is fail-open
  on errors (never blocks on a failed check) and fail-closed on a
  positive detection. The product scale is a vision proposal, never a
  pixel promise: the geometry is deterministic per scale.
- PR-C — text direction and one language per layer (`PR #15`, main
  `3c7c12e`): direction is detected from the text content (first
  strong character), not from the font — the old font-based rule made
  Arabic-in-Inter render left-to-right and Latin TALJ-in-Cairo render
  right-to-left. Each text layer has an explicit direction override
  (auto/ltr/rtl). The planner prompt now requires one language per
  text layer, and the critic warns on mixed scripts.
- PR-D — platform sizes and layout templates (`PR #16`, main
  `f4d32e7`): campaigns choose 1:1 (1080×1080), 4:5 (1080×1350,
  default) or 9:16 (1080×1920); saved creatives keep their size, and
  the tuned 4:5 layout scales vertically only, byte-identical at 4:5.
  Three templates (hero-center, split, minimal) rearrange layers as
  pure geometry, undoable. The critic now warns when the product layer
  is occluded by UI chrome, like any other layer.
- PR-E — polish overlays (`PR #17`, main `57d1058`): soft shadow
  under the product, a reflection, and background color grading, as
  derived stage nodes on the creative — not new layer kinds, so the
  product pixels stay untouched and no critic or repair flow changes.
  Edge feathering was deliberately not re-implemented: PR-A's cutout
  already feathers mask alpha by 1px, and a second display blur would
  only soften the product.
- PR-F — AI reference image (`PR #18`, main `978e9e9`): a full AI
  render from the product photo (Meta edits endpoint) as a style
  target only. It is a separate asset kind, shown side-by-side with
  the canvas, labelled reference-only, and never a layer, never
  exported. Vision reads its zones and suggests the closest template;
  applying is an explicit user button press, undoable. No local
  fallback: a full AI render cannot be faked locally, so the buttons
  stay disabled without a key and consent.
- PR-G — this release (`PR #19`): this report, a README quality
  section, E2E coverage of the new UI (format 9:16 end-to-end export,
  template application + undo, direction override persistence, polish
  persistence + export, reference block gating), and production-smoke
  checks for both new reference routes (origin + consent guards).

## What is NOT live-verified (honest limits)

- The first live SAM call: the segment route exists and is deployed
  (empty POST returns the origin guard), but no paid SAM call has been
  made by the implementation. It needs the owner's key at test time.
- Vision-first background generation and the background re-check:
  same status — routes deployed, no paid calls made by the
  implementation.
- Reference generation and layout analysis: same status.
- Live-verified earlier (2026-10-27, owner's key, one consented
  campaign): Meta planner, image background and critic all succeeded;
  the auto-ads no-key run completed with quality Verified.
- The demo path for the older Sketch2UI product is a separate,
  still-open issue (hosted key rejected by Meta, 401); it is not part
  of this program.

## What remains before submission (not done here)

- The demo video must OPEN with one line stating what was pre-existing
  versus built during the hackathon window (for AdMorph: everything
  built this week), and HACKATHON.md needs the honest one-line note
  about the 2026-10-26 afternoon setup versus the post-kickoff build.
  Both are scheduled as a reminder for 2026-11-03, 10:00 AM Cairo.
- Live SAM / vision / reference verification with the owner's key,
  when he chooses to run it.
- The submission itself, which only the owner approves.
