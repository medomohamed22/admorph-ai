## Update — 30 October 2026

- Three fixed Meta models replace the per-role model pickers; a dark design system and a cleanup of unreachable screens landed (PR #75).
- Navigation is down to four items (Create, My gallery, Brand kits, Settings); variants and seasonal themes open from each saved ad in the gallery.
- Every first visit starts in English, whatever the browser language; the AR/EN button switches, and that saved choice always wins (changed 31 October so judges always land in English).
- Milestone validation and release reports moved to `docs/archive/`.

## Compliance and completion record — 28 October 2026

This section is the 28 October record. Everything below it is the historical record from 26–27 October 2026.

### Dates established from the repository history (all times Cairo, UTC+3)

- **26 October 2026, 14:09** — repository created (initial commit, README stub).
- **26 October 2026, 14:49** — initial working baseline uploaded: application source, plan and documentation.
- **26 October 2026, 15:35–15:36** — campaign workflow update; merge of PR #1.
- **26 October 2026, 19:00** — official kickoff session. Everything above this line on 26 October is the pre-kickoff baseline; everything below was built after the kickoff.
- **27 October 2026, 18:10–22:18** — Meta-only expansion (PR #2), audit fix (PR #3), auto-ads program (PRs #4–#12).
- **27 October 2026, evening** — live Meta verification with the owner's own key and explicit consent: planner, image background generation and critic each succeeded in one studio campaign; the auto-ads no-key run completed with quality Verified.
- **27 October 2026, 23:08–23:26** — quality fixes A–C merged (PRs #13–#15).
- **28 October 2026, 06:46–07:29** — quality fixes D–G merged (PRs #16–#19). Main HEAD: `22ce8c2`.

### What is completed

- Bilingual (English-first + Arabic RTL) creative studio: Brand Kits with logo placement; campaigns from a product upload or a local sample; three brand-consistent concepts the user approves before generation; an editable-layer editor (Konva) with content-detected text direction and per-layer override, layout templates, platform sizes 1:1 / 4:5 / 9:16, and polish overlays (shadow, reflection, background grade) that never touch product pixels.
- SAM product segmentation wired to the studio auto-cutout, with a visible local fallback; vision-first background briefs with a product-presence re-check; an AI reference image shown side-by-side as a style target only — never a layer, never exported.
- Explainable local Critic plus optional Meta Critic; user-approved repairs with before/after comparison and undo/redo.
- Auto-ads: a one-click no-key run (cutout, analysis, backgrounds, composition, copy, review) with a results set, captions and ZIP export.
- Exact-size PNG export, project backup and restore, a public repository and a Vercel production deployment; 238 unit tests and E2E coverage (auto-ads 15/15, quality 15/15) on a local production build.
- No code was imported from any earlier project; this repository contains only work from 26–28 October 2026.

### What is not completed or not verified

- First live SAM segmentation, vision-first background generation and AI reference generation: implemented and deployed, but not yet live-verified — they need the owner's key at test time.
- Demo video: not recorded yet. It must open with: "This project started with an initial baseline uploaded on the afternoon of October 26, before the evening kickoff; all further development shown here was built during the hackathon, October 26 to November 4, 2026."
- Submission: not submitted yet. Deadline: 4 November 2026, 9:00 PM ET (5 November 2026, 4:00 AM Cairo).

> Current source: 1.0.0, Meta-only expansion integrated on 27 October 2026. Earlier sections below record the historical baseline. See [current verification](docs/archive/META_ONLY_VERIFICATION.md); live Meta account access and remote publication remain unverified.

# AdMorph AI — Hackathon development record

**Event:** Meta Global AI Developer Hackathon 2026  
**Recorded project baseline:** 26 October 2026  
**Planned working period:** 26 October–4 November 2026  
**Current feature update:** Release candidate, real demo assets and owner-operated publication preparation  
**Snapshot:** 0.9.0, publication pending

## Statement for judges

> AdMorph AI is an AI-assisted ad-creative studio built for the Meta Global AI Developer Hackathon. The first working baseline documented in this project was prepared on 26 October 2026, and development continues through 4 November 2026. The app runs only on three Meta models with fixed jobs: Muse Spark 1.3 (understanding, brand extraction, ideas, copy and the critic), Muse Image 1.0 (painting the finished ad, enhancement, variants and seasonal themes) and SAM 3.1 (product cutout). Every AI request uses the visitor's own key and an explicit user action; local checks, repairs and the evidence export run without any model. Meaningful changes, verification results and deployments are recorded as they happen in the repository history and build log.

The labels “Day 1”, “Day 2” and “Day 3” in the technical plan refer to implementation milestones. All three were completed in this working session on **26 October 2026**; they are not three separate calendar-day claims. The original plan is retained as a planning document, and actual progress is recorded in [BUILD_LOG.md](BUILD_LOG.md).

## Current evidence

- Source code and milestone validation reports: `docs/archive/DAY1_VALIDATION.md`, `docs/archive/DAY2_VALIDATION.md`, `docs/archive/DAY3_VALIDATION.md`.
- The current no-key interactive sample uses bundled local artwork.
- Provider adapters support catalog listing, credential-test handling and model roles.
- Provider fixtures are explicitly identified in tests.
- Meta catalog and separate text/image smoke adapters exist; **authenticated Meta requests and image generation are not verified in this snapshot**. Owner-triggered smoke requests require a suitable model, key and explicit consent. Fixture results are not live evidence.
- The source is prepared for the owner to upload to GitHub and deploy through Vercel. No remote repository or live deployment is claimed by this package alone.
- Campaign workflow validation: `docs/archive/CAMPAIGN_UPDATE_VALIDATION.md`. The campaign update was implemented on 26 October as another real update on the same date.
- The 27 October studio implementation adds independent editable image/text layers, local sample backgrounds and exact-size PNG export. `docs/archive/STUDIO_VALIDATION.md` records actual checks. Authenticated image generation remains unverified; no new GitHub upload or deployment was performed during this phase.
- The subsequent 27 October review implementation adds measured local design checks and optional model visual opinions with explicit preview-sharing consent. `docs/archive/CRITIC_VALIDATION.md` records that milestone.
- The earliest 26–27 October milestones also carried non-Meta provider adapters. They were removed in the Meta-only expansion (PR #2) and are not part of the app; the archived validation reports keep the original wording.
- The 27 October repair implementation adds validated proposals, explicit approval, measured regression blocking, real before/after renders and durable undo/redo. Separate Meta text/image smoke adapters are fixture-tested. `docs/archive/REPAIR_VALIDATION.md` records current verification and live-provider limitations. No GitHub update or deployment was prepared during this phase.

## How subsequent work will be recorded

The release preparation on **27 October 2026** adds real local browser-demo footage, screenshots, source-package integrity checks, an MIT source license, updated deployment/submission instructions and a production-browser CI configuration. `docs/archive/DAY9_VALIDATION.md` records local verification. The owner previously chose manual publication: no remote repository URL, Vercel URL, remote CI success or organiser submission is invented. Authenticated Meta use remains unverified in the supplied local footage.

The next implementation on **27 October 2026** completes the three-design local workflow with independent templates, saved gallery previews, individual PNG/caption exports, direct creative switching and session-wide key locking. `docs/archive/DAY8_VALIDATION.md` records desktop/mobile/RTL, persistence, cancellation and public BYOK checks. No shared generation key, paid provider demonstration or remote publication is claimed. The numbered milestone is another feature iteration on the same actual date.

1. Make a real implementation change and run appropriate checks.
2. Add a dated factual entry to `BUILD_LOG.md`, linking the actual commit and verification evidence when available.
3. Commit and push with the real work time. Do not alter author/committer dates or create empty commits as activity evidence.
4. Retain GitHub Actions run links and Vercel deployment records for actual changes. The included CI workflow runs checks and records its real UTC run time and commit SHA after upload.
5. Record a working demo video and authenticated Meta integration evidence before final submission. Never include credentials in logs, screenshots or repository files.

Future entries remain planned until backed by completed work. Repository/CI/deployment timestamps help make development inspectable; they are not organiser confirmation of eligibility.

## Attribution

The project was implemented with Codex assistance using a Next.js starter and third-party libraries. Inter/Cairo font licenses are included under `public/fonts`. Application code, sample SVG artwork, project-specific UX and tests are in this repository. No paid AI image generation was used for the bundled sample.

## Official dates

- The event listing gives a 26 October–4 November build period and a submission deadline of **4 November 2026, 9:00 PM US Eastern Time**.
- At that deadline, Cairo is seven hours ahead: **5 November 2026, 4:00 AM Africa/Cairo**. The working completion target remains 4 November.
- Event times can change. Check the event page and accepted Official Rules for the binding schedule and requirements, including any exact start-time restrictions. This file does not assert acceptance, award eligibility or organiser endorsement.

Sources checked 26 October 2026:

- [Event page supplied by the participant](https://cerebralvalley.ai/e/meta-ai-developer-hackathon)
- [Meta official event page](https://dev.meta.ai/events/global-hackathon)

The website exposes the same current/planned distinction at `/hackathon`, linked in the footer.
