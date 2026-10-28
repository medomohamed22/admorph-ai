# AdMorph AI — Meta-only editable creative studio

English/Arabic Next.js app with an interactive local demo, three independent layered campaign designs, original logo placement, review overlays, cultural copy, product variants and complete project backups. **Meta is the only active AI provider.** Existing inactive-provider settings, encrypted keys and saved designs remain readable and preserved.

All local samples run without a key. Meta requests require your own account key, a selected model and explicit potentially billable consent. This implementation has automated fixture verification; it does **not** establish live access to any Meta model or task.

## Run locally on Windows

Requires Node.js 24.x.

```powershell
# Open PowerShell in the project folder.
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open [the local app](http://localhost:3000). For a production build use `npm run build`, then `npm run start -- --hostname 127.0.0.1`.

## Workflows

- Create a Brand Kit, optionally use the explicitly labelled sample extraction, upload the original raster logo and choose one of nine placements, width, safe margin and opacity. Save and edit the suggested identity fields.
- Create a campaign using a product upload or local sample. The original stays immutable. Product makeover is optional; compare, accept or reject a separately stored variant. Existing creatives keep their image assets.
- Generate three local concepts or explicitly request a Meta plan. Select a spatial preset, edit the copy and approve each concept. Compose three independent designs, or open one directly in the Konva editor.
- Adjust actual text/image/logo layers, use local or explicitly requested Meta backgrounds, run measured local checks and optionally request Meta Critic/repair proposals. Repairs require review and acceptance and remain undoable.
- Expand **Creative safety and versions** to choose approximate Feed/Reels zones, logo overrides, seven dialect/tone choices, export preflight and recoverable checkpoints. Dialect proposals are measured with the intended Inter/Cairo font before acceptance; changed design context invalidates a proposal.
- Click numbered canvas markers or a finding's **Fix this element** button for an actual before/after proposal. Desktop comparisons show both images; phones have Original/Variant or Before/After toggles. HUD zones, review markers and selection handles are excluded from PNGs.
- Download exact-size PNGs (1080×1080, 1080×1350 or 1080×1920, by campaign format) and captions. Download runs local preflight; warnings remain warnings, rather than fabricated performance scores.
- In Settings, export a binary `.admorph` project backup and restore it into a fresh browser. It includes project records, image Blobs, variants, versions, reviews and repair snapshots. Settings and credential stores are excluded. Conflicting IDs are rejected without overwriting current edits.

## Quality program (Oct 27–28, 2026)

After a live test ad showed real defects (a product inside the generated background, the product keeping its old background, inconsistent copy, wrong text direction, unprofessional look), the studio gained: SAM product segmentation for the studio auto-cutout (with a visible local fallback), vision-first background briefs with a product-presence re-check, content-detected text direction with per-layer override, platform sizes (1:1, 4:5, 9:16) and three layout templates, polish overlays (shadow, reflection, background grade) that never touch product pixels, and an AI reference image shown side-by-side as a style target only — never a layer, never exported. Full detail, including what is not yet live-verified, is in [docs/RELEASE_QUALITY_REPORT.md](docs/RELEASE_QUALITY_REPORT.md).

## Meta models and task verification

Settings has separate Planner, Background generation, Critic, Edit command, Brand vision, Image editing and Copy roles. Fetch account models or enter an authorised model ID. Missing modality metadata means **unverified**, so it does not prevent selection.

Each explicit task test sends a small synthetic request for that task's actual response schema. Generation and image editing are separate tests and endpoints. Success for text does not verify vision or images. Verification is bound to a one-way fingerprint of the current key, the model, the task and a 24-hour expiry. Changing keys changes the verification context. Only an explicit unsupported-task response marks a task unsupported; quota, authentication, moderation, malformed responses and network problems remain distinct errors.

Brand extraction and Enhance/Recreate run directly with a selected model, your key and explicit consent. No preliminary model test or receipt is required. The local sample and Use Original remain available when access is unverified. No provider URLs are accepted for generated images and no alternate AI provider is used as a fallback.

Fixed endpoints: Meta `chat/completions`, `images/generations` and the documented JSON `images/edits` request with `images[].image_url`. Structured outputs are validated before application. Paid requests have no automatic retries. Catalog GET requests have bounded backoff, jitter and capped `Retry-After` handling. Prices and account access remain unknown unless verified by the provider.

## Vercel and GitHub

Use the **Next.js** Vercel preset, Node **24.x**, install `npm ci`, build `npm run build`, automatic output directory, and this application folder as Root Directory. No credentials are required for the local demo or basic BYOK routes.

Model tests are optional diagnostics. Cached support labels never block generation, vision, editing or any other task. No shared attestation secret is needed to use these features.

GitHub Actions runs lint, types, unit checks, build and Chrome regression tests against `next start`, with no provider secrets. Publication remains owner-operated. No PR, deployment or public account test was created by this implementation.

## Storage and security boundaries

Dexie migrations 1–6 are additive. Old provider/source records remain inactive rather than being rewritten as Meta output. Original assets are retained for variants and saved history. Autosave reports durable versus session-only state. Plaintext API keys remain in memory; optional AES-GCM vault records use version-two PBKDF2 with 600,000 iterations, while version-one 310,000-iteration records still decrypt.

AI routes require same-origin JSON, bounded schemas, fixed Meta hosts, explicit consent and bounded raster decoding. Each warm worker enforces one concurrent request, six requests/minute and 100/day per hashed BYOK key, with a bounded bucket count. These are **per-instance best-effort limits**, not distributed quotas or authenticated user identity. Origin checks alone are not authentication. No owner-funded key is read from the environment.

CSP starts in **Report-Only** mode; framing, MIME-sniffing, referrer and device-permission headers are also configured. Report-Only CSP and an encrypted vault do not make a compromised browser/XSS safe: unlocked keys and decrypted content can still be accessed by same-origin code. No formal security audit or distributed abuse protection is claimed.

Raster uploads are PNG/JPEG/WebP with signature/MIME/decode/dimension limits. SVG is rejected. Full binary backups are limited to 100 MB, manifest JSON to 2 MB, individual assets to 3 MB; restore validates hashes, ranges, image decoding and referenced assets before an additive transaction.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run start -- --hostname 127.0.0.1
# In a second terminal:
npm run test:e2e
npm run test:production
```

Browser projects cover desktop 1440px, a 375px touch profile and 320px viewport, in English and Arabic. Mobile tests use Chrome emulation; physical-device Safari/Android and remote Vercel remain separate verification steps. See [implementation ledger](META_ONLY_IMPLEMENTATION.md) and [verification report](META_ONLY_VERIFICATION.md) for actual results and limitations.

The older [recorded demo](docs/demo/AdMorph-demo.mp4), [captions](docs/demo/AdMorph-demo.srt), frozen `releases/` directories and prior milestone reports describe the **historical 0.9 baseline**. They are not evidence for the new Meta features. Refresh the final competition demo and real account evidence before submission. Commit/CI timestamps should record actual subsequent work; feature milestone numbers are not claims of work on separate calendar days.

The source uses the [MIT license](LICENSE); fonts and packages retain their [third-party notices](THIRD_PARTY_NOTICES.md). Protocol references: [Meta models](https://dev.meta.ai/docs/models), [chat completions](https://dev.meta.ai/docs/protocols/chat-completions), [structured output](https://dev.meta.ai/docs/structured-output), [image understanding](https://dev.meta.ai/docs/image-understanding), [image generation](https://dev.meta.ai/docs/image-generation) and [image API](https://dev.meta.ai/docs/api-reference/images/create-image).
