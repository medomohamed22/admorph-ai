# Campaign workflow update — verification

Recorded on **26 October 2026**, Africa/Cairo. Source version **0.4.0**. This is another actual feature update on the same date, not a claim of elapsed calendar days.

## Implemented

- Responsive campaign form: saved Brand Kit snapshot or clearly labelled sample brand, uploaded/previewed product, brief, goal, English/Arabic creative language, 1080 × 1350 format.
- PNG/JPEG/WebP validation in the browser: up to 2 MB and 4096 pixels per side. Server requests are bounded to 3 MB and verify image signatures/MIME/size before forwarding. No arbitrary image URL proxy.
- Gemini planning through the fixed official host, using the explicitly saved Planner model and an in-memory user key. Image/brief sharing consent is separate from Settings catalog consent, resets after input changes/navigation/reload and is never persisted.
- One paid POST attempt per explicit click, a server deadline, bounded responses, no automatic paid retry, cancellation and safe error codes. No raw provider error or credential is returned/logged by application handlers.
- Exactly three Zod-validated concepts with distinct discovery/offer, benefit and lifestyle angles and distinct title/headline/caption/visual-direction text. Local validation cannot guarantee creative quality; users review the result.
- Editable title, audience angle, headline, caption and visual direction. Individual approval; edits reopen approval. Input changes invalidate all approvals while keeping previous concepts. Failed/cancelled planning does not replace successful work.
- Clearly labelled deterministic local templates. These use brand name/language and do not analyze the image or brief; no external AI request occurs.
- IndexedDB version 2 adds campaign records without clearing existing tables. Product Blobs are separate from metadata; saved drafts, concept edits/approvals and campaign switching survive reload. Provider keys and consent are absent from campaign records. Storage-denied fallback remains usable in memory and does not claim a local save.

## Final checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | **70 passed** |
| `npm run build` | Passed, including dynamic `/api/ai/plan` |
| `npm run test:e2e` | **84 passed**, desktop 1440 px, touch emulation 390 px and small phone 320 px |
| `npm run test:production` | Passed against final local production build; no browser errors |

Tests cover selected-model routing, explicit consent/no-request guards, key exclusion/redaction, fixed upstream, missing/foreign origin, invalid image/size, structured response failures, quota, timeout, no paid retries, cancellation, schema migration, real browser persistence, editing/approval invalidation, provider navigation, multiple campaigns and storage denial. Existing provider, Brand Kit, language, crypto and hackathon flows passed regression checks.

Production evidence: `docs/evidence/campaign-production-smoke.json`, `campaign-production-en.png`, `campaign-production-ar.png`. The smoke report records actual UTC verification time and explicitly marks paid API calls and remote deployment verification false. Unit storage migration uses fake IndexedDB; browser persistence uses real Chrome IndexedDB in isolated test profiles.

## Boundaries

Gemini's wire format was checked against [GenerateContent documentation](https://ai.google.dev/api/generate-content) and [structured output documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Automated provider responses use synthetic fixtures and dummy keys. **No paid authenticated Gemini or Meta call was executed or claimed.** Real account quota, region, selected-model availability and creative quality remain to be verified using the owner's credentials and explicit UI consent.

Other providers retain catalog/configuration support. Image generation, the complete editor, campaign ZIP backup/cloud sync, Critic/fixes and authenticated Meta demonstration remain planned. Brand exports do not include campaigns. Physical mobile Safari/Android testing was not performed.

The prior `releases/AdMorph-GitHub-Vercel` snapshot is retained unchanged. The manual update packet contains only changed/new source files plus the new source manifest, with separate commit/PR text and Arabic upload instructions. Its manifest records hashes and actual preparation time. GitHub/Vercel publication is performed by the owner; no remote commit, PR or deployment is claimed here.
