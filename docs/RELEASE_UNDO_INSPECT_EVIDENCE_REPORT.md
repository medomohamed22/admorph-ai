# Release report — Undo, mockup check, evidence export, manual cutout, no consent gate (Oct 29, 2026)

## What changed and why

Three approved additions, plus two flow changes the owner ordered with them:

1. **Undo/redo on the canvas.** Every committed arrangement change is kept in
   a 50-step history (drag, resize, nudge, add, delete, text edit). Two
   buttons sit next to Delete in the canvas section. The first cutout and a
   fresh product upload are not history entries, so undo never resurrects a
   previous product's layout.
2. **Deterministic mockup check.** A "Mockup check" panel at the end of the
   canvas section recomputes on every arrangement: text/logo overlapping
   the product (error), texts overlapping each other, logo over text, text
   contrast below 4.5 on the mockup sheet, text closer than 60px to a frame
   edge. Pure geometry and pixel math (`src/lib/oneshot/rules.ts`) — no
   model call, no automatic fix. Blank text boxes render nothing and are
   excluded from every rule.
3. **Evidence ZIP export.** Next to the PNG download, "Export evidence ZIP"
   downloads `admorph-evidence.zip`: the finished PNG plus
   `evidence-manifest.json` with SHA-256 of the original upload, of the
   product actually used, and of the exported PNG; the five deterministic
   checks run on the layout the ad was generated from; the model IDs used;
   the certificate summary labeled as a model judgment; the rule version;
   and the failed-check list. Keys never enter the manifest.
4. **Manual SAM cutout.** Uploading a product photo no longer cuts it out.
   The product card shows the original photo, and an "Isolate background"
   button next to it runs SAM on press. A new upload resets the cutout,
   layout, result and certificate — they belonged to the previous product.
5. **No consent checkbox.** Every action button now works directly: the
   button press itself is the user's consent for that call, and the request
   bodies still send `consent: true` to the server. The checkbox, its state
   and all its guards are gone; each button sits next to its own task.

## Certificate invalidation

The on-screen certificate is valid only while the mockup and brand still
match the verified snapshot (a content signature over geometry, text,
color, font and brand). Any edit after verification clears the certificate
and the score — the panel never shows a certificate for a mockup that no
longer exists. The exported manifest is unaffected by later edits: its
checks run on the generation-time layout snapshot, and its
`certificateStatus` reads `valid`, `cleared_after_edit` or `none`.

## The undo bug found by E2E

The first full E2E run failed only the undo test on all three viewports:
undo ran (history emptied, redo enabled) but the text stayed. Root cause
was a stale-ref bug in the history effect: the `setPast` updater read
`prevElements.current` lazily, after the effect body had already
overwritten it with the new elements — so history recorded the new state
instead of the old one. Fixed by capturing the previous value in a local
before updating the ref. The undo test then passed 3/3, and the full suite
was re-run on the final build.

## Verification

- Lint 0 errors (pre-existing `<img>` warnings only), `tsc` clean, unit
  309/309 (37 files, +10 new: rules + manifest), clean production build.
- One-shot E2E 33/33 on the local production build (11 tests × 3
  viewports), including the three new tests (undo/redo, mockup check,
  evidence download + invalidation) and all seven updated tests (isolate
  click after upload, no consent steps).
- No paid calls by the implementation.

## Honest limits

- Undo/redo cover the layout only: re-cutting after enhance changes the
  product blob, and undo does not restore the previous blob.
- The mockup check measures contrast against the neutral mockup sheet, not
  the final AI background — it catches unreadable colors, not every
  background clash.
- The manifest proves what was checked and what was generated, not that
  the model kept the product: that part stays a labeled model judgment,
  exactly as the certificate already was.
