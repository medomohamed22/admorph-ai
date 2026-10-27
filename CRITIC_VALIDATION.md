# Design checks and Critic — local validation

Implemented **27 October 2026**, Africa/Cairo. Source **0.6.0**. Scope: deterministic checks, optional Gemini visual review and explanations. Automatic fixes/comparison and Meta smoke tests remain the following milestone.

## Working behavior

- **Review design** opens review on desktop/mobile. Automatic local checks use current logical layer data and unbounded Konva text-layout measurements after bundled fonts load. They detect text clipping/unrenderable glyphs, invalid/out-of-bounds geometry, missing visible required copy/images, unexpected dimensions and logo/headline box overlap.
- Solid text-fill contrast uses a documented 4.5:1 local target. Image-backed/overlapping contrast is not claimed as verified. Missing text measurements and inapplicable checks are marked partial. Geometric overlap explanations explicitly distinguish boxes from transparent pixels. No quality/performance score is invented.
- Findings explain the issue and let users inspect the actual layer. Manual edits trigger fresh local checks. Nothing applies repairs automatically.
- **Review with Gemini** requires a saved compatible Gemini Critic, an in-memory key and separate explicit preview-sharing consent. The reduced preview includes the rendered product/logo/copy; original source files are not separately attached. The 540 × 675 JPEG is flattened on white where the composition is transparent, limited to 512 KB, and sent with layer metadata/caption through the fixed official Gemini host.
- The response is strict JSON: summary and up to twelve bounded observations, conservative severity/category, explanation, manual recommendation and a known layer ID or null. Unknown fields, score/action payloads, unknown layer references, malformed responses and refusals are not presented as valid reviews. AI observations are labelled subjective/unverified separately from local checks.
- Review provenance/opinion/fingerprint is saved in a separate IndexedDB version-four table. Earlier brands/campaigns/creatives/assets/settings/credentials are preserved. Keys, request consent and preview images are not stored in review records. Local findings are recomputed rather than restored as timeless facts.
- Layout/caption/language changes invalidate consent and mark prior opinions stale. Pending requests are cancelled/fenced on changes or unmount. Failures/cancellation keep previous successful opinions and do not alter the design. No automatic paid retries or review requests run after generation, edit or reload.

## Checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | **91 passed** |
| `npm run build` | Passed, including dynamic `/api/ai/critic` |
| `npm run test:e2e` | **123 passed** across desktop 1440 px, touch-emulated phone 390 px and small phone 320 px |
| `npm run test:production` | Passed against the compiled local application; no browser errors |
| Final development smoke | Passed on localhost:3000: real clipping/contrast findings, no unexpected reload, no paid request |

Tests cover measured Arabic clipping, low contrast, manual correction/recheck, logo overlap/selection, missing stored product assets even with export disabled, preview size/content, explicit consent/no-request guards, chosen-model routing, persisted/stale reviews, key/image exclusion from storage, failure/cancellation, a held late response after edits, fixed upstream/no arbitrary URLs, response validation, refusal/truncation, timeouts, no retries and additive migration from version three. Existing provider, crypto, branding, campaigns, touch editing and actual PNG export workflows passed regression checks.

Evidence: `docs/evidence/critic-production-smoke.json` records actual UTC verification time and false paid/deployment verification flags. `docs/evidence/critic-production-ar.png` shows real clipping/contrast detection in the mobile Arabic interface. `docs/evidence/critic-development-smoke.json` records the final development-server check. Production requests with foreign origins or missing consent/body are rejected before upstream calls.

## Limits and next stage

Gemini wire handling follows the [official GenerateContent reference](https://ai.google.dev/api/generate-content) and [structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Automated responses use synthetic fixtures and dummy keys. **No authenticated paid Gemini or Meta request was executed or claimed.** Real account/model access, opinion quality and provider billing require an owner-triggered real-key UI request.

Local checks are narrow diagnostics, not a design-quality guarantee or full accessibility certification. AI findings can be wrong or miss problems; they are not measured facts, campaign-performance forecasts or an endorsement. Browser QA uses Chrome emulation, not physical Safari/Android hardware. Automatic fix application, before/after comparison and new Meta calls were intentionally not implemented. No GitHub packet/commit/PR or remote deployment was created; existing release snapshots remain unchanged.
