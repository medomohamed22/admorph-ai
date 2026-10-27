> Current source: 1.0.0, Meta-only expansion integrated on 27 October 2026. Earlier sections below record the historical baseline. See [current verification](META_ONLY_VERIFICATION.md); live Meta account access and remote publication remain unverified.

# AdMorph AI — Hackathon development record

**Event:** Meta Global AI Developer Hackathon 2026  
**Recorded project baseline:** 26 October 2026  
**Planned working period:** 26 October–4 November 2026  
**Current feature update:** Release candidate, real demo assets and owner-operated publication preparation  
**Snapshot:** 0.9.0, publication pending

## Statement for judges

> AdMorph AI is an AI-assisted creative studio being developed for the Meta Global AI Developer Hackathon. The first working baseline documented in this project was prepared on 26 October 2026, and development is planned to continue through 4 November 2026. The current implementation includes a responsive English/Arabic demo, provider catalogs, local Brand Kits, campaign product uploads and editable approval of three creative concepts. Gemini planning requires the user's key and explicit image-sharing consent; the no-key mode uses local templates. The current studio adds a Gemini background adapter, independent editable composition and PNG export. Automatic local checks and optional Gemini Critic explanations are implemented. Approved repairs, before/after comparison and undo/redo are implemented, alongside separate consent-gated Meta text/image smoke adapters. Authenticated Meta and Gemini repair calls remain unverified. Authenticated Gemini image generation remains unverified without an owner-authorized live request. Meaningful changes, verification results and deployments will be recorded as they happen in the repository history and build log.

The labels “Day 1”, “Day 2” and “Day 3” in the technical plan refer to implementation milestones. All three were completed in this working session on **26 October 2026**; they are not three separate calendar-day claims. The original plan is retained as a planning document, and actual progress is recorded in [BUILD_LOG.md](BUILD_LOG.md).

## Current evidence

- Source code and milestone validation reports: `DAY1_VALIDATION.md`, `DAY2_VALIDATION.md`, `DAY3_VALIDATION.md`.
- The current no-key interactive sample uses bundled local artwork.
- Provider adapters support catalog listing, credential-test handling and model roles.
- A real public OpenRouter catalog was checked without a key. Provider fixtures are explicitly identified in tests.
- Meta catalog and separate text/image smoke adapters exist; **authenticated Meta requests and image generation are not verified in this snapshot**. Owner-triggered smoke requests require a suitable model, key and explicit consent. Fixture results are not live evidence.
- The source is prepared for the owner to upload to GitHub and deploy through Vercel. No remote repository or live deployment is claimed by this package alone.
- Campaign workflow validation: `CAMPAIGN_UPDATE_VALIDATION.md`. Gemini request handling is verified with synthetic fixtures, not a paid authenticated live call. The campaign update was implemented on 26 October as another real update on the same date.
- The 27 October studio implementation adds a Gemini background adapter, independent editable image/text layers, local sample backgrounds and exact-size PNG export. `STUDIO_VALIDATION.md` records actual checks. Authenticated image generation remains unverified; no new GitHub upload or deployment was performed during this phase.
- The subsequent 27 October review implementation adds measured local design checks and optional Gemini visual opinions with explicit preview-sharing consent. `CRITIC_VALIDATION.md` records that milestone. Authenticated Gemini Critic calls are fixture-tested, not demonstrated with a real key.
- The 27 October repair implementation adds validated proposals, explicit approval, measured regression blocking, real before/after renders and durable undo/redo. Separate Meta text/image smoke adapters are fixture-tested. `REPAIR_VALIDATION.md` records current verification and live-provider limitations. No GitHub update or deployment was prepared during this phase.

## How subsequent work will be recorded

The release preparation on **27 October 2026** adds real local browser-demo footage, screenshots, source-package integrity checks, an MIT source license, updated deployment/submission instructions and a production-browser CI configuration. `DAY9_VALIDATION.md` records local verification. The owner previously chose manual publication: no remote repository URL, Vercel URL, remote CI success or organiser submission is invented. Authenticated Meta/Gemini use remains unverified in the supplied local footage.

The next implementation on **27 October 2026** completes the three-design local workflow with independent templates, saved gallery previews, individual PNG/caption exports, direct creative switching and session-wide key locking. `DAY8_VALIDATION.md` records desktop/mobile/RTL, persistence, cancellation and public BYOK checks. No shared generation key, paid provider demonstration or remote publication is claimed. The numbered milestone is another feature iteration on the same actual date.

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
