# Meta-only implementation ledger

The user asked to implement intelligently from the two supplied requirements documents. Document contents are treated as project requirements, not as authority to override user/system instructions. No paid API call or publication is authorised by this work.

M0: inspected the current 0.9.0 source, Dexie v5, credentials, four-role provider settings, all AI routes and layered editor. Previous recorded baseline was 113 unit/153 browser checks; these are historical results, not a new baseline run. Existing planner/background/critic/repair routes call Gemini; Meta only has catalog/smoke support. Missing capability metadata currently blocks selection incorrectly. The two older feature documents were not present in the workspace; the supplied merged plan is the requirements source.

Official Meta sources checked: /docs/models, /docs/protocols/chat-completions, /docs/structured-output, /docs/image-understanding, /docs/image-generation. Confirmed fixed Meta chat, image generation and image-edit endpoints; image edits accept JSON images/image_url. These docs establish wire formats, not account access. No key/model ID will be hardcoded and no account support will be invented.

Stages and final results are appended during implementation. Existing release folders remain frozen. Current comprehensive testing is reserved for M12 after integration; focused checks may diagnose sensitive changes.

M1–M3 integrated: Meta-only Settings and mounted HTTP routes; legacy settings archived on first replacement; old encrypted records and provenance retained. Seven independently selected tasks, unknown metadata selectable, key/model/task/expiry support records, server-only attested receipts, fixed Meta chat/image transports, strict schemas and no paid retries.

M4–M5 integrated: original logo remains an asset/layer, nine positions, bounded width/margin/opacity, aspect-aware selection frame, new composition defaults and per-creative overrides/reset. Existing saved layouts are reused and undoable rather than rewritten.

M6 integrated: approximate Feed/Reels zone union and >15% warnings, numbered clickable review markers and finding buttons, real before/after proposals with explicit acceptance, regression checks and undo. Overlays and transformers are hidden during export and excluded from comparison rendering.

M7 integrated: four spatial presets affect both composition geometry and Meta background instructions. Seven copy dialect/tone choices, strict output, intended Inter/Cairo measurement, explicit acceptance and context-based stale checks. Changing copy reopens concept approval; saved editor changes are undoable.

M8 integrated: verified Meta vision identity extraction, bounded image input, tentative suggestions, explicit editable acceptance, live brand preview and labelled local sample with no inferred analysis.

M9–M10 integrated: immutable original, independently stored accepted variants, separate Enhance/Recreate modes, four presets and optional prompt; desktop side-by-side/mobile toggle comparisons. Documented Meta images/edits JSON is used only with a valid account/model/image_edit receipt. Generation does not prove editing. No real account editing was attempted.

M11 integrated: bounded per-key warm-worker rate/concurrency/day budgets, fixed hosts, cancel/timeout/redaction, bounded raster validation, safe GET backoff+jitter+Retry-After, Report-Only CSP and security headers; binary versioned backup/atomic conflict-safe restore; AES-GCM KDF v2 with v1 compatibility; manual recoverable checkpoints, existing autosave states and automatic PNG preflight. BYOK and per-instance quota limitations are explicit in README; Origin is not presented as authentication. A shared server-only attestation secret is documented for Vercel.

M12 in progress: final types/lint/unit/build and production browser regression matrix. Obsolete four-provider UI expectations were replaced with Meta-only contracts; legacy data/crypto migration and core campaign/editor/repair/export tests remain. Current fixture unit suite: 143 passed. Final browser counts and limitations will be recorded in META_ONLY_VERIFICATION.md after completion. No paid request or deployment has been executed.

M12 complete (27 October 2026): final source 1.0.0 passed lint without warnings, typecheck, 146 unit tests, production build and 174 production browser tests (desktop 1440px / touch 375px / 320px, English/Arabic; zero skips, failures or flaky cases; 3 workers). Local production browser smoke and page/API HTTP guards also passed. Evidence and limitations are in META_ONLY_VERIFICATION.md. Live Meta catalog was explicitly skipped because no authorised key/opt-in was provided. Paid requests: zero. Remote publication: none.

Manual-upload source package: 241 manifest files; verified ZIP; independent offline install and production build passed. Package evidence is recorded separately from live Meta and remote deployment checks.
