# Approved repairs and Meta smoke adapters — validation

Implemented **27 October 2026**, Africa/Cairo. Source **0.7.0**, milestone 7. Work stops before milestone 8. These numbered milestones describe feature iterations, not separate calendar dates or GitHub activity.

## Implemented behavior

- Local proposals target actual Konva-measured clipping, solid-fill contrast, hidden existing copy and geometric logo/headline overlap. They preserve original copy and immutable image assets. Empty proposals explain that manual work remains.
- Optional Gemini repair planning uses the saved Edit command model, a 540 × 675 JPEG and separate preview-sharing/potential billing consent. A strict sixteen-action allowlist accepts movement, resizing, text color/font/copy, an existing text fill and restoring text visibility. JSON, layer IDs/kinds, colors and finite numbers are validated; geometry/font sizes are clamped. No arbitrary code, image replacement or external URL action executes.
- The user reviews rationale, effective changes and actual 1080 × 1350 before/after canvas renders before approval. Rendering clones the detached drawing layer and removes selection handles; the editable source remains unchanged until **Apply fixes**.
- New/worse measured findings, unrenderable glyphs or increased logo overlap block application. Existing partial/unknown checks remain limitations. Clipping and contrast improvements are demonstrated without inventing a quality score, advertising outcome or full accessibility certification.
- Applying a fresh proposal saves the composition plus validated before/after snapshots atomically. Receipt validation replays the allowed actions. IndexedDB version 5 adds `repairHistory` and retains existing stores. A property-order-independent fingerprint also reads legacy review fingerprints correctly.
- **Undo fixes / Redo fixes** and comparison work after reload. Later manual edits disable snapshot restoration to protect the changed creative. Replaced image identities make comparison report unavailable instead of showing the wrong source. History-write failure keeps session recovery and an honest unsaved label.
- Two consecutive approved passes stop further proposals until a manual edit starts a new cycle. No automatic paid review, repair loop or retry runs. Cancelling a request stops waiting; a provider may already have processed it.
- Settings adds independent Meta text/image smoke requests. Each needs an in-memory/unlocked Meta key, selected capability-appropriate model and explicit per-mode consent. Unknown capability metadata requires acknowledgement; known incompatible metadata cannot be overridden.
- Meta chat uses the fixed prompt `Reply with the single word: ready`, `max_completion_tokens:512` and `/chat/completions`. Image smoke uses a fixed abstract circle prompt, `n:1`, `response_format:b64_json`, `output_format:png` and `/images/generations`. Both use fixed Meta hosts, one attempt and bounded responses; image URLs are never followed. No user files are sent.
- Smoke evidence is session-only unless exported as JSON with model/time/mode and a successful result summary. Exports contain no key or image bytes. Fixtures explicitly say **Synthetic fixture · not live Meta evidence**. A successful request verifies that selected request/model only.

## Verification

- `npm run lint`: passed, no warnings.
- `npm run typecheck`: passed.
- `npm test`: **104 passed**, including allowlist/kind/clamp/nonmutation checks, measured improvements/regressions, legacy fingerprints, atomic save/rollback, version-4 migration, and separate Gemini/Meta wire formats, consent/origin guards, failures, timeouts and no retries.
- `npm run build`: production build passed with both new server routes.
- Full `npm run test:e2e`: **138 passed**. Desktop 1440px, mobile 390px and small phone 320px exercise English/Arabic, actual before/after PNGs, unchanged source until approval, regression/stale rejection, two-pass limit, reload undo/redo, later-edit protection, storage failure and consent-gated fixture smoke/evidence export, alongside all existing regression checks.
- After final build-record wording was updated, its three viewport checks passed again. Final typecheck and lint passed.
- `npm run test:production`: passed at **2026-10-27T08:26:31.850Z**, no browser exceptions or paid requests. Real before/after PNGs, approved clipping/contrast improvement, reload undo/redo and protected repair/Meta routes passed. See `docs/evidence/repair-production-smoke.json`, `repair-before.png`, `repair-after.png` and `repair-production-comparison-ar.png`.
- `node scripts/repair-dev-smoke.mjs`: passed at **2026-10-27T08:29:23.006Z** against `http://localhost:3000`. Actual Arabic clipping/contrast repair, two full-resolution renders, reload undo/redo and 320px RTL passed. Zero browser exceptions, unexpected navigations or paid requests; no HMR reload loop. Evidence: `docs/evidence/repair-dev-smoke.json` and `repair-dev-ar.png`.

## Live-provider boundary and next scope

No authenticated paid Meta/Gemini repair request ran during implementation. Adapter responses use injected unit fixtures and intercepted browser fixtures. No real key, account access, quota or chosen model's live generation capability is certified. The Settings smoke UI is ready for an owner-authorized live check; exported synthetic evidence must not be presented as a Meta response.

The Meta smoke adapter is separate from Gemini campaign planning/background generation; this milestone does not claim an end-to-end Meta campaign workflow. Third-creative expansion and public-demo polish remain milestone 8. No new upload package, GitHub commit/PR/publication or Vercel deployment was prepared. Existing frozen release folders remain unchanged.

## Provider references

- [Meta chat quickstart](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions), [chat protocol](https://dev.meta.ai/docs/protocols/chat-completions).
- [Meta image generation](https://dev.meta.ai/docs/image-generation), [create-image API](https://dev.meta.ai/docs/api-reference/images/create-image).
- Existing Gemini structured-output transport is reused with a separate repair action schema and consent boundary.
