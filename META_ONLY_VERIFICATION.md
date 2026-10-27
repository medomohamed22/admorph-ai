# Meta-only integration verification — 1.0.0

Verified locally on **27 October 2026**. Implementation stages: [M0–M12 ledger](META_ONLY_IMPLEMENTATION.md). Current setup and Vercel instructions: [README](README.md).

| Check | Actual result |
|---|---|
| `npm run lint` | PASS, no errors or warnings |
| `npm run typecheck` | PASS: Next route types and `tsc --noEmit` |
| `npm test` | **146 passed**, 0 failed |
| `npm run build` | PASS, production output generated |
| Production Playwright matrix | **174 passed**, 0 skipped, 0 unexpected, 0 flaky; 3 workers |
| `npm run test:production` | PASS, local production browser smoke; browser errors `[]` |
| Local HTTP deployment checker | PASS: five pages/health and eleven API input guards; no remote deployment |
| `npm run test:catalog:live` | **SKIPPED** explicitly: no owner opt-in/key, no request made |

Final browser matrix started at **2026-10-27 13:10:49 UTC**, duration **192.6 seconds**, against `next start` on localhost:3000. Profiles: desktop **1440×1000**, mobile **375×812** with touch emulation, and **320×800**. English and Arabic, Cairo/Inter fonts and horizontal overflow checks are included. Chrome emulation does not constitute physical iPhone/Safari/Android verification.

Machine-readable evidence: [unit results](docs/evidence/meta-unit-final.json), [browser results](docs/evidence/meta-browser-final.json), [production smoke](docs/evidence/meta-production-smoke.json), [local HTTP checks](docs/evidence/release-local-http.json), [explicitly skipped catalog check](docs/evidence/meta-catalog-check.json).

## What was verified

- Meta is the only active Settings provider and mounted AI backend. Inactive choices, encrypted records and old output provenance survive; malformed old vault rows are retained and skipped without preventing valid choices from loading. Additive Dexie migrations and v1/v2 encryption compatibility pass.
- Seven independent tasks; missing capability metadata stays selectable/unverified. Key/model/task/expiry bindings, explicit support versus transient errors, signed receipts, unsupported guards, fixed hosts, paid single-attempt behavior and output validation have fixture coverage. Synthetic task tests use each task's actual schema.
- The original logo remains a separate asset and layer, with nine placements, aspect-aware geometry, width/margin/opacity and undoable overrides. Four spatial presets override existing angle templates and reach the background prompt.
- Seven dialect/tone choices; proposals need acceptance and actual text measurement in the intended font, and changed context invalidates them. Brand identity suggestions are editable; local examples are labelled.
- Product originals and accepted variants remain separate. Existing creatives retain their original image references. Invalid/unverified editing is gated, and documented Meta image-edit JSON is checked with fixtures. Mobile comparisons have toggles.
- Feed/Reels approximations generate >15% occlusion warnings. Numbered markers open actual issue dialogs; approved fixes use before/after renders, regression checks and undo. PNG bytes are unchanged when HUD/markers are shown/hidden. PNG dimensions remain **1080×1350**, including zoomed editors and the three-design gallery.
- Saved checkpoints restore editable content and can be undone. Binary backups restore image Blobs, variants, versions and saved work into a fresh browser without credentials; corrupt ranges/checksums and conflicting IDs are rejected transactionally.
- Storage-denied operation remains editable and exportable with honest session-only state. An already-open editor can edit, save locally and export PNG while offline; offline startup/navigation is not promised.
- Per-key concurrency/minute/day limits, total warm-worker concurrency, bounded rasters, strict repair allowlists, consent/origin/input guards and safe response handling pass local checks.

## Evidence boundaries

**No real Meta key was supplied and no paid AI request ran.** Mock/fixture success verifies contracts and application behavior; it does not prove live model access, image quality, pricing, task availability, moderation outcomes or account permission. Brand vision and image editing require a real successful account-specific task test before use.

Configure a shared server-only `ADMORPH_TASK_PROOF_SECRET` for receipts across Vercel instances. Without it, local process receipts can expire on restart or fail on a different instance. It is an attestation secret, not an AI funding key.

Limits are best effort **per warm worker**: one concurrent request per hashed key, four total, six/minute and 100 per 24-hour window per key, with bounded buckets. No distributed quota service or trusted-user login was added. Origin checks are not authentication. CSP is **Report-Only**, with no claim of XSS immunity or a formal security audit.

Feed/Reels zones are explicitly labelled approximations. Local findings and AI opinions are partial review aids, not accessibility, advertising-policy, CTR or campaign-performance certification.

No GitHub repository/PR, Vercel deployment or competition submission was created. Frozen 0.9 releases and earlier demo footage remain historical. The current source can be packaged with `npm run package:upload`; its manifest and ZIP verification prove file integrity rather than live provider/deployment access.

Earlier integration failures were corrected, rather than suppressed: production prerender time reads, storage-denied startup, corrupt-vault restoration, stale preflight context, cached-route test selectors, mobile panel selection and the offline banner. The final matrix above completed with all tests passing.

## Prepared manual-upload package

A clean source folder and ZIP were prepared locally: `releases/AdMorph-1.0.0-GitHub-Vercel`. The folder has **241 manifest-listed source/assets/evidence files** and no node_modules/.next; the ZIP has 242 verified entries including the manifest. A separate verification copy installed **395 packages with npm ci --offline** and completed its own production build successfully. See [package evidence](docs/evidence/meta-release-check.json).

ZIP SHA-256: `e513f9b0ad5412febb4efe2721cd307ccad978d85ce34e106f79b5d048f62894`. Old release folders were not replaced. No upload/publication was performed.

## Development reload fix — 27 October 2026

The production matrix above preceded this development-only follow-up. Tailwind source discovery is now explicitly scoped to `src` using `source("../")`, excluding nested release/build copies that caused continuous development recompilation and browser refresh. The development browser remained on the same document during idle observation and a generated release-file change; editing and Settings stayed functional, with zero browser errors/reloads. A production build of the patched source passed in the independent verification copy. Evidence: docs/evidence/dev-stability.json. The original 174-test production matrix was not rerun for this source-scanning change.

## Meta catalog and selection follow-up — 27 October 2026

Observed development logs showed a catalog request timing out at 12 seconds followed by a successful catalog response. The safe catalog GET now has a 30-second attempt timeout and 60-second total deadline (client 65 seconds). Fetch is explicitly authorised by its button and does not require generation consent. Each task now has a fetched-model selector alongside manual input; a successful explicit task test saves its selected model. Exact model IDs are retained end-to-end, with a consistent 240-character validator supporting namespaced/colon IDs while rejecting traversal and URL query injection. Nullable optional metadata no longer invalidates the catalog; empty catalogs have a visible explanation. Paid task requests still require explicit consent.

Follow-up checks: 148 unit tests passed, types/lint passed, independent production build passed, and 21 focused browser checks passed across desktop/375px/320px. Browser provider responses were fixtures, not evidence of paid Meta account access. Evidence: docs/evidence/meta-selection-fix.json. The earlier full production matrix remains historical and was not rerun for this follow-up.

## Latest owner override: no mandatory model tests

The owner explicitly removed the prerequisite-test policy. Model tests and support labels are now optional diagnostics, never permission gates. Vision/image editing accept direct requests without a receipt. Cached failed tests and catalog availability flags do not block task selection. Existing key, consent, image/input validation, fixed Meta hosts and request limits remain. Brand extraction has an inline model picker and can reuse the saved Planner; product editing can reuse the saved image model. Uploading a valid brand reference enables consent independently of any test.

Follow-up: 148 unit tests, types, clean lint and independent production build passed. Six browser checks across desktop/375px/320px verified direct brand extraction and product editing with zero preliminary task-test calls, including old failed support records. Provider replies were fixtures, with no paid verification calls. Evidence: docs/evidence/direct-meta-use.json. Earlier statements requiring test receipts or a shared secret are historical and superseded.

## Brand request diagnosis and stale development schema

The user's real local HTTP attempts returned application-level 400 responses. A no-provider validation route identified the rejected field as `proof`, although current source makes that legacy field optional. Restarting the owned Next development server changed the same contributor/JPEG/no-receipt request from HTTP 400 to HTTP 200, confirming a stale running schema. The local route reports `metaRequests: 0` and never contacts Meta. It is optional and never gates extraction.

Errors now distinguish application schema fields, internal failures and Meta upstream rejection. Meta messages/parameters are bounded and scrubbed of the submitted credential and image data; error references correlate with secret-free console metadata. No raw user request/key is logged. Unit checks (150) and three actual local HTTP/browser checks passed. Live Meta extraction remains pending the owner's explicit button action; no paid test was performed by the agent.
