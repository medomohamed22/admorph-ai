> Historical 0.9 baseline. Current 1.0.0 results are in [META_ONLY_VERIFICATION.md](META_ONLY_VERIFICATION.md).

# GitHub / Vercel source-package verification

Snapshot: **AdMorph AI 0.3.0 — milestone 3**. Prepared on **26 October 2026**. The owner requested a local folder for manual GitHub upload and Vercel deployment.

## Verified locally

- Main workspace: lint, TypeScript and production build passed.
- Unit tests: **59 passed**.
- Browser checks: **66 passed** across desktop, phone emulation and 320px, including the bilingual hackathon page and earlier features.
- Source ZIP was extracted to an isolated verification directory, followed by **fresh `npm ci`**, lint, unit tests, TypeScript and production build.
- Node runtime used: 24.x. `engines.node` pins the supported Vercel major version.
- Next.js build and output-tracing roots are explicitly the current project directory. The verified release does not resolve source files outside its own root.
- A production server from the independent copy ran at `http://localhost:3101`.
- Production smoke checked the homepage, `/hackathon` in English/Arabic, RTL/mobile overflow, Brand Kit save/reload, health, missing-key rejection and Custom proxy rejection. **All passed; zero browser errors**.
- The actual local-production check completed at **2026-10-26T11:41:46.057Z**. See [structured report](docs/evidence/production-smoke.json) and [Arabic mobile capture](docs/evidence/hackathon-mobile-ar.png).

## Package contents and safeguards

The upload folder includes application source, local assets/fonts/licenses, tests, lockfile, GitHub CI workflow, Vercel configuration, manual deployment instructions, hackathon/build-log documents and verification evidence.

It excludes `.git`, `node_modules`, `.next`, `.vercel`, browser databases, generated test traces/reports, private environment files, API keys and passphrases. `.env.example` is comments only. `PACKAGE_MANIFEST.json` records each included file's SHA-256 and size, with an actual preparation timestamp. Final archive entries are checked against the manifest. The app/config files match the independently built copy; final documentation/evidence additions do not change runtime code.

Generated `releases` folders are excluded from Git, TypeScript scanning and ESLint so future source development does not accidentally compile packaged copies.

## Not represented as remotely verified

- No GitHub repository was created or pushed in this task.
- GitHub Actions are configured, but have not run remotely before the owner uploads.
- No Vercel deployment or public Production URL was created. The local production smoke is not a cloud-deployment claim.
- Vercel instructions use the documented native Next.js preset, Node 24.x, `npm ci`, `npm run build` and automatic output directory. No environment variables are required by this baseline.
- This report records the historical 0.3.0 release. The current campaign update adds a Gemini BYOK text planner; see `CAMPAIGN_UPDATE_VALIDATION.md`. Authenticated live Meta/Gemini requests remain unverified without user-supplied credentials, and image generation remains planned.

After manual deployment, verify the Production URL from a fresh browser and record the actual Vercel deployment link in BUILD_LOG.md. GitHub commit/CI timestamps and Vercel deployment records will then provide independently visible records of subsequent work.
