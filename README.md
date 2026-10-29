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

## Smart-fix program (Oct 28, 2026)

After a second live test found eight more problems (key wiped on reload, a nine-minute vision hang with no error, a failed first reference generation, a template select that never confirmed the applied layout, a silent cutout method, invisible dark-on-dark product and text, a small can, Arabic text forced to LTR passing the critic), the studio gained: an auto-opening encrypted key vault so one passphrase unlock survives reloads, a 65s vision watchdog with an inline timeout error, tolerant reference/edits parsing with shape-only diagnostics, a durable applied-template display, a visible cutout-method line, a pixel post-background review that measures real product/text contrast and auto-applies the vision scale size and a readable text color in one undoable update (plus a grade repair), and a direction-mismatch critic rule with a one-click reset to automatic. Full detail, including what is not yet live-verified, is in [docs/RELEASE_SMART_FIXES_REPORT.md](docs/RELEASE_SMART_FIXES_REPORT.md).

## One-shot ad mode (Oct 28, 2026)

Alongside the layered editor, a new `/oneshot` mode lets the user arrange a product, logo, headline, extra text, phone number and icons on a mockup canvas (drag by touch or mouse), then one Meta images/edits call paints the finished ad from that mockup, with an optional enhance switch for poor phone photos and a vision fidelity certificate scoring product, logo, layout and text matches — with phone digits pinnable exactly instead of model-generated. Full detail, including what is not yet live-verified, is in [docs/RELEASE_ONESHOT_REPORT.md](docs/RELEASE_ONESHOT_REPORT.md).

## SAM fix program (Oct 28, 2026)

After the first live one-shot test showed a local cutout for the third run in a row and an invisible enhance result, the segment route got the vision timeout fix (55s + maxDuration 60), the one-shot cutout became SAM-only with visible errors instead of a silent local fallback, and the enhance switch gained a success note plus an original-vs-improved preview. The editor keeps its local fallback for the no-key demo. Full detail, including the honest limit that only a live retest proves the timeout fix, is in [docs/RELEASE_SAM_FIX_REPORT.md](docs/RELEASE_SAM_FIX_REPORT.md).

## One-shot simplification (Oct 28, 2026)

The one-shot mode is now the whole site, rebuilt as one guided journey in five steps (product → brand → idea → arrange → generate). The old campaigns, layered editor and auto-ads routes redirect to `/oneshot`; upload cards make it clear which button uploads the product, the logo or an icon; a brand-kit picker fills identity and logo from a saved kit (or returns from a new kit already selected); ad ideas generate from the product photo and brand with the written brief optional; a stepper shows progress; the canvas blurs with a shimmer while the final image generates and the result fades in; and on phones the generate button sticks to the bottom of the screen. Full detail is in [docs/RELEASE_SIMPLIFICATION_REPORT.md](docs/RELEASE_SIMPLIFICATION_REPORT.md).

## Result frame, canvas controls and brand fonts (Oct 29, 2026)

The finished ad now has a permanent home: a result frame sits above the generate button, visible from the moment the page loads — empty with a note before the first generation, blurring with a shimmer while the image generates or verifies, and revealing the finished ad inside the same frame afterwards, with the download link and fidelity certificate beneath it. The canvas itself stays sharp during generation. The selected canvas element can be resized and nudged with explicit touch-friendly buttons (enlarge, shrink, four arrows) in addition to dragging and the corner handles, and the change is proven by the layout the generate call actually sends. Brand extraction now also suggests a Google Fonts family matching the wordmark (Arabic families for Arabic wordmarks, Latin display families otherwise, from a fixed allowlist so no hallucinated family is ever loaded); the font is fetched from Google Fonts and applied to the headline in the mockup, falling back to Cairo/Inter for missing glyphs. Full detail is in [docs/RELEASE_RESULT_FRAME_REPORT.md](docs/RELEASE_RESULT_FRAME_REPORT.md).

## Undo, mockup check, evidence export, manual cutout (Oct 29, 2026)

The canvas now has undo/redo (50 steps, next to Delete), a deterministic "Mockup check" panel that measures five things on every arrangement — element over product, texts over each other, logo over text, text contrast below 4.5, text within 60px of a frame edge — without calling any model or fixing anything by itself, and an evidence export next to the PNG download: a ZIP with the finished ad plus a manifest (SHA-256 hashes of the original product, the product used, and the export; the deterministic checks on the generation-time layout; model IDs; the certificate labeled as a model judgment). Any edit after verification clears the on-screen certificate, since it described a mockup that no longer exists. Two flow changes came with this round: SAM cutout no longer runs on upload — an "Isolate background" button next to the product card runs it on press — and the consent checkbox is gone, so each action button works directly where it sits (the request bodies still send `consent: true`). Full detail is in [docs/RELEASE_UNDO_INSPECT_EVIDENCE_REPORT.md](docs/RELEASE_UNDO_INSPECT_EVIDENCE_REPORT.md).

## Suggested fonts, mobile drag, logo keeps its place (Oct 29, 2026)

Three fixes from live phone testing. First, idea generation now also suggests three headline fonts that fit the product and brand identity (chosen only from the same fixed allowlist as brand extraction, most fitting first); a picker under the ideas applies the chosen family to the headline in the mockup, falling back to the extracted brand font when the planner suggests none. Second, dragging works on phones: every image element now has an invisible hit area covering its full box (previously the product, logo and icon images were non-listening, so taps and drags passed straight through to the stage and the page scrolled instead), and the canvas host claims the touch gesture so a drag moves the element instead of scrolling the page. Third, the logo keeps its arranged position: replacing the logo — by uploading a new file or picking another brand kit — swaps only the image, never the geometry, and a test proves a nudged logo survives a brand switch into the generate call. Full detail is in [docs/RELEASE_FONTS_DRAG_REPORT.md](docs/RELEASE_FONTS_DRAG_REPORT.md).

## Closed-loop repair on the mockup (Oct 29, 2026)

The "Mockup check" panel used to only report problems. Now it closes the loop: each finding carries its own "Apply fix" button, and every fix is computed deterministically from the same rule set — move the overlapping item to the first clear position (the product and the logo never move for a finding), recolor low-contrast text to the highest-contrast brand color that passes 4.5, or pull text inside the 60px safe margin. A finding with no fitting fix says so plainly instead of guessing. Applying a fix is an ordinary canvas edit, so Undo reverses it, the applied fixes are listed under the panel, and the inspect re-runs on the new arrangement — that re-run is the verify step. No model is consulted anywhere in the loop, so the demo moment cannot fail on a model reply. Full detail is in [docs/RELEASE_REPAIR_LOOP_REPORT.md](docs/RELEASE_REPAIR_LOOP_REPORT.md).

## Phone-number pinning removed (Oct 29, 2026)

The generate step used to draw the phone digits over the finished ad a second time ("pinning"). Since the model already paints the number from the mockup layout, and layout preservation is never pixel-exact, the drawn copy landed on top of the model's own digits and ghosted — ruining the image. The pin step, its checkbox and its message key are removed: the result is now used exactly as the model returned it, and the vision certificate still reads the digits back and reports a mismatch as a failed text check instead of silently fixing it. Full detail is in [docs/RELEASE_PHONE_PIN_REMOVAL.md](docs/RELEASE_PHONE_PIN_REMOVAL.md).

## Meta models and task verification

Settings has separate Planner, Background generation, Critic, Edit command, Brand vision, Image editing and Copy roles. Fetch account models or enter an authorised model ID. Missing modality metadata means **unverified**, so it does not prevent selection.

Each explicit task test sends a small synthetic request for that task's actual response schema. Generation and image editing are separate tests and endpoints. Success for text does not verify vision or images. Verification is bound to a one-way fingerprint of the current key, the model, the task and a 24-hour expiry. Changing keys changes the verification context. Only an explicit unsupported-task response marks a task unsupported; quota, authentication, moderation, malformed responses and network problems remain distinct errors.

Brand extraction and Enhance/Recreate run directly with a selected model, your key and explicit consent. No preliminary model test or receipt is required. The local sample and Use Original remain available when access is unverified. Provider URLs are never handed to the client; a URL envelope is fetched and validated server-side only, and no alternate AI provider is used as a fallback.

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
