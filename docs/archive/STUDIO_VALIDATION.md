# Editable studio — local verification

Implemented **27 October 2026**, Africa/Cairo. Source version **0.5.0**. Scope: background adapter, independent editable composition and PNG export. AI Critic/repair is a later stage.

## Implemented behavior

- An approved concept opens a real per-concept Konva editor. No image request runs automatically.
- Separate background, original product, optional original logo, brand name, headline and CTA layers. Text remains text in saved data; images remain separate Blobs. Product/logo assets are copied into the creative so campaign image replacement cannot delete them.
- Drag/resize, bounded positions/sizes, keyboard nudges, visibility, colors, Inter/Cairo fonts, stacking order and session undo/redo. Mobile exposes Layers/Edit/Background/Export panels and viewport-fit/zoom scrolling.
- Additive IndexedDB version 3, transactional creative/assets saves, serialized autosave, save status, recent-edit flush when changing concepts and an exportable session if storage is denied. Earlier tables are preserved; no migration clears existing work.
- PNG export is exactly **1080 × 1350** at any canvas zoom. Fonts and image decoding finish before export. Selection handles are excluded. Captions remain separately editable.
- Local background mode creates a clearly labelled gradient from brand colors without an AI provider.
- Gemini uses the saved Image maker model ID, the user's in-memory key and separate per-request consent. Incomplete Gemini catalogs have a user-confirmed model fallback; known text-only/unavailable metadata cannot be overridden. User confirmation is never presented as verified account access.
- The server sends background-only instructions and brand/visual-direction metadata to the fixed Gemini host. Product/logo files are not sent. Returned raster data is bounded, MIME/dimensions are validated, and arbitrary provider image URLs are not fetched. Paid requests are attempted once; no automatic retry. Cancellation and regeneration failure preserve existing work.

## Verification results

| Check | Result |
| --- | --- |
| Lint | Passed |
| TypeScript/Next route types | Passed |
| Unit tests | **79 passed** |
| Production build | Passed, including `/api/ai/background` and dynamic studio routes |
| Full browser regression | **105 passed** |
| Focused final studio recheck | **21 passed** after touch-panning/theme-contrast refinements |
| Production smoke | Passed; no browser errors; actual 1080 × 1350 PNG downloaded and decoded |
| Development smoke | Passed after warming generated cache: no reload after input, edits preserved |

The browser suite runs against the compiled production application at desktop 1440 px, touch-emulated phone 390 px and small phone 320 px. It tests real downloaded PNG headers/content, local logo visibility affecting exported pixels, Arabic/Cairo copy, actual mouse/touch dragging, numeric geometry, zoom export, reload, multiple concepts, consent, selected-model routing, cancellation, failed regeneration and denied storage. Existing brand/provider/crypto/campaign/hackathon tests remain in the regression suite. Unit tests cover version-two migration, schema/geometry validation, transactional rollback, fixed-host requests, safe errors, timeouts, no automatic retries and refusal to follow provider URLs.

Production evidence:

- `docs/evidence/studio-production-smoke.json` — actual UTC timestamp and explicit paid/deployment verification boundaries.
- `docs/evidence/studio-production-ar.png` — mobile Arabic interface screenshot.
- `docs/evidence/studio-production-export.png` — actual exported local-sample composition, not an authenticated Gemini generation.

## Honest boundaries

**No authenticated paid Gemini or Meta request was executed.** Image responses in automated tests are local synthetic fixtures; local sample backgrounds are generated on-device. The Gemini wire contract was checked against [official image generation documentation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation). Export behavior follows [Konva's export documentation](https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html). Actual account/model access and generated-image quality require the owner's explicit UI action with a real key.

There are no server-owned keys. No new GitHub update packet, commit, PR or remote deployment was created in this stage; the owner requested finishing the complete build first. Earlier release snapshots were left unchanged. Manual history is session-only; complete campaign backup, AI Critic, constrained repairs and authenticated Meta demonstration remain planned. Mobile testing is Chrome emulation, not physical Safari/Android device testing.
