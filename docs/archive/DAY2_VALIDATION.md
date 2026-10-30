# Day 2 execution and validation

Historical checkpoint. Day 3 adds local persistence, Arabic/RTL and Brand Kits. See DAY3_VALIDATION.md and README.md for current behavior.

Current scope: Settings provider registry, temporary BYOK handling, live model catalogs, connection tests, model filters, manual text fallback, and per-role model selection. Stop before Day 3 persistence, Arabic switching and Brand Kit workflows.

## Completed work

- [x] Review the build plan, current code and installed Next.js route/client component documentation.
- [x] Review official Gemini, Meta and OpenRouter catalog/authentication documentation.
- [x] Registry and separate Gemini/Meta/OpenRouter/Custom catalog adapters with Zod schemas.
- [x] Working official `/api/providers/models` and `/api/providers/test` POST routes.
- [x] Provider-scoped in-memory keys, show/hide, clear, explicit request consent, fixed upstream hosts, no secret storage/logging, no arbitrary upstream forwarding or paid generation.
- [x] Gemini pagination, duplicate suppression, bounded retries/timeouts, safe 400/401/403/404/429/quota/network/schema/CORS errors and cancellation.
- [x] Debounced search, Text/Vision/Image filters, metadata badges, provider-reported availability filter, empty/loading/error/last-success states.
- [x] Conservative capabilities: model names are not evidence for image support. Gemini method-only text candidates are labelled provisional; explicit nontext output is respected.
- [x] Quick text roles, per-role providers, manual unverified text fallback and image-role capability enforcement.
- [x] Save role selections in tab memory across app navigation; resetting on reload is explicitly stated. No Day 3 persistence implemented.
- [x] Custom browser-direct HTTPS connection, endpoint consent reset on URL changes, no redirect forwarding, honest CORS/reachability status.
- [x] English default maintained; dictionary key parity and Arabic entries for new Day 2 strings.
- [x] Preserve the existing demo and later-milestone shells; update health to milestone 2.

## Verification

- Lint: passed, no warnings.
- TypeScript: passed (`next typegen && tsc --noEmit`).
- Unit: 42 passed across two files. Covers reference contrast and dictionary parity plus provider pagination/normalization/capabilities, manual fallback, role restrictions, missing keys, consent and origin checks, arbitrary URL rejection, size limits, malformed JSON, safe upstream errors, retries, cancellation, timeout, key redaction and Custom URL handling.
- Browser: 36 tests across desktop 1440px, touch-phone 390px and small-phone 320px. Includes Day 1 regression checks plus no-key/consent guards, filters and role assignments, mixed-provider roles, session saves/navigation, key isolation/reload/clear, show/hide, error/retry/empty/cancel states, manual IDs, Custom direct CORS behavior and real local API rejection checks.
- Production build: passed, including both new dynamic POST routes and all existing pages.
- Live public catalog: verified against real OpenRouter through the local API and through the actual Chrome UI with no key. At verification, HTTP 200 returned 467 models, including 12 reporting image output. UI quick text setup, session Save Settings and image filtering passed, with no browser errors.
- Visual QA: desktop/mobile Settings screenshots checked for layout and readable controls; overflow assertions pass at all three viewport sizes.

## Evidence

Generated and ignored by Git:

- `test-results/desktop-day2-settings.png`
- `test-results/mobile-day2-settings.png`
- `test-results/small-phone-day2-settings.png`
- `test-results/live-openrouter-settings.png`
- `test-results/live-catalog.json`

Browser fixture data uses `fixture-key-not-real`. Default tests do not call external providers. The opt-in `npm run test:catalog:live` only reads the public OpenRouter catalog, with no credentials or generation. Model counts are a snapshot and may change.

## Limits and milestone boundary

No real Gemini/Meta/OpenRouter API keys were provided, so authenticated live-provider acceptance is unverified. Adapter and credential-test behaviors were tested using representative synthetic responses. Custom success/failure paths use a simulated browser endpoint. Actual third-party Custom compatibility depends on its schema, HTTPS and CORS configuration.

No paid generation was requested or executed. No IndexedDB/Brand Kit persistence, encrypted remember-key option, Arabic/RTL switching, campaign planner, image generation, full editor, GitHub push or deployment was implemented. No physical-phone Safari/Android verification is claimed.

Day 1 history remains in `DAY1_VALIDATION.md`; `README.md` describes the current Day 2 behavior and commands.
