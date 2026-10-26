# AdMorph AI — Hackathon development record

**Event:** Meta Global AI Developer Hackathon 2026  
**Recorded project baseline:** 26 October 2026  
**Planned working period:** 26 October–4 November 2026  
**Current feature update:** Campaign creation, planning and concept approval  
**Snapshot:** 0.4.0, work in progress

## Statement for judges

> AdMorph AI is an AI-assisted creative studio being developed for the Meta Global AI Developer Hackathon. The first working baseline documented in this project was prepared on 26 October 2026, and development is planned to continue through 4 November 2026. The current implementation includes a responsive English/Arabic demo, provider catalogs, local Brand Kits, campaign product uploads and editable approval of three creative concepts. Gemini planning requires the user's key and explicit image-sharing consent; the no-key mode uses local templates. Image generation, Critic/repair workflows and authenticated Meta integration are planned next. Meaningful changes, verification results and deployments will be recorded as they happen in the repository history and build log.

The labels “Day 1”, “Day 2” and “Day 3” in the technical plan refer to implementation milestones. All three were completed in this working session on **26 October 2026**; they are not three separate calendar-day claims. The original plan is retained as a planning document, and actual progress is recorded in [BUILD_LOG.md](BUILD_LOG.md).

## Current evidence

- Source code and milestone validation reports: `DAY1_VALIDATION.md`, `DAY2_VALIDATION.md`, `DAY3_VALIDATION.md`.
- The current no-key interactive sample uses bundled local artwork.
- Provider adapters support catalog listing, credential-test handling and model roles.
- A real public OpenRouter catalog was checked without a key. Provider fixtures are explicitly identified in tests.
- The Meta catalog adapter exists; **authenticated Meta requests and image generation are not verified in this snapshot**. Meta model usage will be demonstrated and documented once implemented with authorised credentials.
- The source is prepared for the owner to upload to GitHub and deploy through Vercel. No remote repository or live deployment is claimed by this package alone.
- Campaign workflow validation: `CAMPAIGN_UPDATE_VALIDATION.md`. Gemini request handling is verified with synthetic fixtures, not a paid authenticated live call. The campaign update was implemented on 26 October as another real update on the same date.

## How subsequent work will be recorded

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
