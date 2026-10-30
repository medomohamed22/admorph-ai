# Three-creative workflow and public BYOK demo — validation

Implemented **27 October 2026**, Africa/Cairo. Source **0.8.0**, feature milestone 8. The numbered day is an implementation milestone, not a separate calendar-day activity claim. Work stops before milestone 9 publication/submission work.

## Implemented and reviewable

- `/campaigns/new`: use a sample product or upload a product, create three concepts, review/approve each, then **Build three local designs**. All-three preparation requires current approval. Individual approved concepts still open independently.
- Three distinct, editable offer/benefit/lifestyle templates: centered product, split headline/product and product-first lifestyle. New compositions own immutable product/logo references; source-photo replacement does not remove saved composition assets. Existing compositions are reused without rewriting saved edits or copy.
- The campaign gallery renders actual Konva layers and local image Blobs. Each card exports its own 1080 × 1350 PNG and plain-text caption, opens its own editor and identifies composition/local/generated source. No fake AI generation, scores or performance guarantees.
- The editor switches directly between approved creatives while retaining each composition and caption. General manual undo resets when opening another composition; approved-repair snapshots still support durable undo/redo. Pending background generation is cancelled/fenced on navigation, and image readiness belongs to the current mounted canvas rather than a prior creative.
- Set writes use one transaction. A failed write retains three exportable session designs with an unsaved label. Unreadable older data is not blindly replaced. Existing storage schema stays version 5; no reset or browser-data clearing occurs.
- English/Arabic gallery, switcher, statuses and privacy explanations; narrow-screen stacking, RTL, touch targets and reduced-motion support. Source badges wrap on narrow Arabic cards rather than overlapping headings.
- Header **Lock session keys** clears all providers’ in-memory credentials/consent in the current app session and cancels pending UI requests. Project data, selected model roles and encrypted credentials remain. The existing provider-specific forget action deletes encrypted copies. A late vault unlock checks the lock epoch before restoring a plaintext key.
- Settings explains no-key local behavior, optional encryption and locked/unlocked state. There is no shared owner-funded generation key or environment-secret fallback. Fresh browser contexts start in English with blank keys. No paid generation runs automatically.
- Basic HTTP protections: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and disabled camera/microphone/geolocation permissions. Existing fixed-host, bounded-body, origin/consent and no-store protections remain. This is not a full security audit or a distributed rate-limiting claim.

## Checks

- `npm test`: **111 passed**, including seven new cases for three distinct bounded templates, independent owned assets, preservation of edits, approval/staleness guards, atomic reload/rollback, Arabic Cairo layers and absence of owner-key fallback on all five paid routes.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed.
- Full `npm run test:e2e`: **153 passed** across all three viewport projects. After the final gallery-only badge wrapping and RTL dimension-display adjustments, the **15** gallery/BYOK checks passed again. These are repeated checks, not additional distinct tests.
- Browser suite covers all previous workflows plus three independent exports/edits/reload, session-only failure, session-wide key clearing/cancellation, public response headers, blank-key request rejection and late-response fencing on creative switches, on desktop, mobile and 320px phone contexts.
- Older status/source assertions were scoped to their intended Settings/editor sections because the new gallery and privacy status legitimately introduce additional matching text, including retained hidden routes.
- `node scripts/creative-set-smoke.mjs`: production check passed at **2026-10-27T09:24:19.899Z** in fresh English 1440px and Arabic 320px contexts. Three distinct full-size PNGs and a caption were downloaded, edits survived switching/reload/rebuilding, and locking preserved local export. No page overflow, unexpected navigation, browser exception or paid call. Evidence: `docs/evidence/creative-set-production-smoke.json`. Both screenshots were visually inspected; the Arabic source badge wraps without overlapping the title and output dimensions retain their intended order.
- `npm run test:production`: existing campaign/studio/repair/compare/reload-undo regression smoke passed without browser exceptions or paid calls.
- Final development smoke passed at **2026-10-27T09:26:22.607Z** on `http://localhost:3000`: fresh English/Arabic contexts, three real exports each, caption export, retained edits, session lock and stable navigation. Zero unexpected navigations, browser exceptions or paid calls. Evidence: `docs/evidence/creative-set-development-smoke.json`. The development server remains running.

## Evidence and scope limits

QA screenshots and real exported PNGs: `docs/evidence/creative-set-production-en.png`, `creative-set-production-ar-card.png`, `creative-set-1.png`, `creative-set-2.png`, `creative-set-3.png`. Production/development smoke JSON contains actual UTC run times and explicitly says remote deployment is unverified.

No authenticated Meta/Gemini paid request ran. Provider-facing cancellation/UI tests use labelled synthetic fixtures; successful local PNG exports are real browser renders. Account/model/quota access and actual paid generation remain unverified. Existing optional Gemini and Meta adapters remain available for an owner-triggered, explicitly consented request.

No update package, GitHub commit/PR/upload, Vercel deployment, submission video or final submission was prepared. Existing frozen release folders and prior milestone evidence remain unchanged. Milestone 9 remains future owner-authorized work.
