# Release candidate 0.9.0 — local handoff verification

Prepared **27 October 2026**, Africa/Cairo. This is feature milestone 9, not a claim of nine elapsed work days. The owner chose manual GitHub upload and Vercel publication. Local preparation does not establish a repository URL, remote CI result, public deployment or organiser submission.

## Delivered source and media

- Current source, lockfile, Node 24.x/Next.js Vercel configuration, source MIT license and third-party font notices.
- Updated README, Arabic manual deployment guide, English submission guide and neutral commit/PR wording.
- Real isolated-browser MP4: **68.96 seconds, 1440 × 1000, H.264**, silent with English annotations and a matching SRT. Recording at **2026-10-27T09:40:42.290Z** used local sample templates; no paid provider request or browser exception. `docs/demo/recording.json` records chapter timing and provenance. Decoded middle/Settings frames were visually inspected.
- Screenshots: actual home, Brand Kit, three-design gallery, before/after repair dialog and empty-key Settings. `docs/demo/creative-export.png` is a real 1080 × 1350 PNG, not a screenshot.
- Versioned source packaging with generated/private path exclusions, supported secret-pattern scanning, comment-only `.env.example`, per-file SHA-256 manifests and independent ZIP entry/checksum verification. Pattern scanning is not a universal secret-detection guarantee.
- GitHub Actions configuration now installs Chrome and tests the production build, with read-only repository permissions and failure-only diagnostic retention. Official `actions/checkout`, `setup-node` and `upload-artifact` v7 usage was checked; no remote Actions run is claimed.
- `scripts/verify-deployment.mjs` checks an owner-supplied HTTPS origin after publication. It verifies pages, health/capability fields, security headers and empty-input guards without keys or paid requests. `--local` explicitly labels localhost checks as local.

## Local verification

- `npm test`: **113 passed** (including two release path/credential-format safeguard tests).
- Main workspace: lint and typecheck passed, production build passed, **153 browser tests passed** across desktop/mobile/320px projects. Tests use local data and synthetic provider fixtures.
- A manifest-verified source ZIP was extracted to `releases/verification-0.9.0`. A fresh `npm ci` installed 395 packages; npm reported zero vulnerabilities in that audit snapshot. Install warnings concerned deprecated ESLint tooling and an unapproved resolver postinstall; subsequent lint/types/unit/build all succeeded. No dependency upgrades were introduced to hide those warnings.
- The independent extraction passed lint, typecheck, **113 unit tests** and production build from its own root. Its production server at `http://localhost:3101` passed the campaign/editor/repair/undo smoke at **2026-10-27T09:50:11.577Z**. Fresh English/Arabic three-design export/persistence checks also passed, without browser exceptions, unexpected navigations or paid requests. See `docs/evidence/release-isolated-production-smoke.json` and `release-isolated-three-designs.json`.
- Final handoff documentation/evidence and the extraction utility are added after the independent build; the final manifest/ZIP is rescanned and checked, and runtime/config/dependency source is compared with that independently built copy. This does not claim Linux/Vercel or remote CI execution.
- Production regression smoke passed at **2026-10-27T09:43:28.401Z**: sample/brand/campaign/editor/Arabic checks, actual repair comparison, reload undo/redo, exports and origin/consent guards. No browser exceptions or paid calls.
- Local HTTP deployment-checker validation passed at **2026-10-27T09:43:31.433Z**, labelled local and with `remoteDeploymentVerified:false`. Pages/health return 200; all five empty-input paid routes return 400 with no-store headers.
- Existing milestone-3 frozen releases and historical milestone reports remain unchanged. The current clean source package and independent extraction live under new release-specific paths.
- Final development smoke passed at **2026-10-27T09:53:24.534Z** on port 3000: fresh English/Arabic sessions, all three full-size exports, caption downloads, retained edits and session locking. No browser exceptions, unexpected navigations or paid calls. The development server remains running; see `docs/evidence/release-development-smoke.json`.
- At **2026-10-27T09:54:02.484Z**, all **127** compared runtime/config/test/asset files matched the independently built extraction byte-for-byte. See `docs/evidence/release-source-comparison.json`.

## Final handoff paths

Use **`releases/AdMorph-0.9.0-GitHub-Vercel-2`** for manual upload, or extract its matching **`AdMorph-0.9.0-GitHub-Vercel-2.zip`**. The ZIP checksum is supplied as an adjacent `.zip.sha256` sidecar; the manifest inside verifies every included file. The earlier unsuffixed package was the extraction/build candidate, not the final handoff. `releases/verification-0.9.0` contains test dependencies/build output and must not be uploaded.

The final runtime/config/test/asset source is compared with the independently built candidate; documentation, release utilities and final evidence additions are rescanned and covered by the final archive manifest. This records local reproducibility, not an actual GitHub/Vercel publication.

## Remaining owner verification

The owner must upload the prepared source into the actual existing/new GitHub repository, review the real Actions run, import that repository into Vercel and verify the public Production URL in a fresh browser. Run the supplied HTTP checker and retain the actual URL/time, then check bilingual storage/mobile/repair flows. Upload the MP4 to an accessible video host and complete the actual organiser portal fields.

Authenticated Meta/Gemini calls, quota/model access and live generated-image quality remain unverified. The demo and tests must not be presented as paid Meta generation evidence or organiser acceptance. No competition entry has been submitted by this task.
