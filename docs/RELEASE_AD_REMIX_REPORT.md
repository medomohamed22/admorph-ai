# Ad variants + seasonal themes (Oct 29, 2026)

Two new standalone pages that remix a finished ad, instead of growing
the one-shot flow. The owner chose both, with three rules: the headline
changes and the model paints it normally; saving is a PNG download; and
both pages pick their source from the project's generated images.

## How it works

- **Gallery.** Every finished ad saves itself to a new `savedAds`
  IndexedDB table (Dexie version 8): the PNG plus its brand, headline,
  logo presence and source (`oneshot`, `variants`, `themes`). The
  gallery loads only on the remix pages, never on app start, so old
  sessions pay nothing for it. A saved ad can be deleted from its card
  with the same two-step in-page confirm as brand deletion.
- **Variants page (`/variants`).** Pick a saved ad, pick 2 or 3. The
  planner reads the ad and proposes three fresh angles; the first N
  become jobs. Each job repaints the ad through a new `ad-remix` image
  edit (same product and logo, new scene, new headline rendered
  exactly as written, old headline removed) and then runs the existing
  one-shot certificate against a product/logo/headline layout. Each
  result saves back to the gallery and downloads as PNG.
- **Themes page (`/themes`).** Same flow, but the planner gets a
  seasonal brief per theme (Ramadan, Eid, Black Friday, Summer) and
  the first concept of each becomes one themed copy. Up to 3 themes
  per run.
- **One-shot unchanged, plus one hook.** After a finished ad validates,
  it auto-saves to the gallery (fire-and-forget: a gallery failure can
  never break the ad; the PNG download remains the reliable save).

## What was reused, what is new

- Reused with no changes: the planner op, the verify-oneshot op, the
  certificate score, the provider roles (planner / image / vision or
  critic), and the task-proof mapping for image edits.
- New: the `ad-remix` server op (prompt in `src/lib/ai/remix.ts`),
  the `savedAds` table + repository functions, the shared
  `AdRemixStudio` component, the two pages, header links, and the
  `remix` message section in both locales.

## Fix: oversized saved ads failed both pages (Oct 29, 2026, evening)

- **Bug, reported by the owner with screenshots:** both remix pages
  failed with "invalid_request" on a real saved ad, while fixtures
  passed. Root cause from the code: the remix pages base64-encoded
  the finished ad PNG as-is, but every server op enforces the 2 MB
  image cap (`inputImage` data length) — a photographic 1080x1350
  PNG is larger than 2 MB, so the planner, the remix and the verify
  all failed schema validation before any model call. One-shot never
  hit this because it fits its mockup and result first.
- **Fix:** the remix pages now fit the source ad with
  `fitProductImage` once per run (planner + remix) and fit each
  variant before verification — the same pattern one-shot uses.
  The gallery still keeps the original full-quality PNG for download;
  only the request payload is fitted.
- **Also in this fix:** the picked saved ad now shows a clear
  selection ring plus a "selected" label, the picker / count / themes
  / delete lock while a run is in progress, and the results area
  shows empty slots (2 or 3) as soon as a source is picked, filling
  in as each copy finishes — on both pages.
- **Regression test:** a seeded noise PNG over 2 MB now generates 2
  variants, and the planner request body stays under the 3 MB
  request cap.

- The headline is model-painted, by the owner's explicit choice, so a
  garbled headline is possible; the certificate reads it back and a
  mismatch lowers the score instead of passing silently.
- The certificate's layout zones for a remix are aspirational (product
  center, logo top-right, headline top). If the model moves an element,
  the layout check fails and the score says so.
- The gallery starts empty at launch: ads generated before this
  release were never saved, so they cannot be picked up. The PNG
  download from any run remains the way to keep an ad outside the app.
- No paid Meta calls in the gate: all generation and verification runs
  below are fixtures. Live verification with a real key was not done
  for this round.

## Gate

- ESLint: 0 errors (pre-existing warnings only)
- TypeScript: clean
- Unit: 332/332 (41 files, incl. 5 new ad-remix tests; 4 migration
  tests re-pinned from schema version 7 to 8)
- Clean production build
- E2E: 66/66 (22 tests x 3 viewports: one-shot + brand-fixes +
  wordmark-logo + 2 new ad-remix tests)
