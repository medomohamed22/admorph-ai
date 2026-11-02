# AdMorph AI — owner submission guide

## Project description

**AdMorph AI turns one phone photo of a product (or of a whole shelf) into finished, Instagram-ready ads in the shop owner's dialect, using three Meta models: Muse Spark 1.3 reads, writes and reviews; SAM 3.1 cuts the product out; Muse Image 1.0 paints.**

Current flows: a five-step one-shot studio; shelf to campaign (a photo or short video, one ad per product); seasonal copies and variants of a saved ad that keep the logo and icons where they were; six copy dialects with right-to-left support; and a guided demo that runs the whole site. The site uses its own Meta key, set on the server as `META_API_KEY`; visitors enter no key. Brands, ads and drafts stay on the device (IndexedDB). See `README.md`, `HACKATHON.md`, `BUILD_LOG.md` and the `/hackathon` page for the current state; the evidence list below comes from an earlier, local-only version (27 October).

## Review the evidence

- `docs/demo/AdMorph-demo.mp4`: app footage of that earlier local-only version (silent; see `docs/demo/recording.json` for its date). It is not the final demo video, which is still to be recorded.
- `docs/demo/recording.json`: actual recording time, chapters, dimensions and no-paid-call boundary.
- `docs/demo/three-designs.png`: real three-design gallery.
- `docs/demo/repair-comparison.png`: actual full-resolution before/after canvas comparison.
- `docs/demo/settings.png`: safe empty-key Settings state.
- `docs/evidence/`: dated local production/development checks. Historical reports retain their original dates/versions.
- `docs/archive/DAY9_VALIDATION.md`: release checks and package-verification limits.

The recording deliberately uses local sample templates. Do not describe it as authenticated Meta/Gemini generation. Provider-facing automated tests use synthetic fixtures. Catalog availability does not establish model/account generation access. Confirm the accepted-applicant portal's actual requirements and obtain genuine, explicitly authorised provider evidence before making a live-usage claim.

## Owner fields to complete after publication

| Field | Current state |
| --- | --- |
| Public GitHub repository URL | Pending owner upload; do not paste a guessed URL |
| Public Vercel Production URL | Pending owner deployment |
| Video hosting/share URL | Upload the supplied MP4 and check judge access |
| Actual commit SHA / CI run | Record the real uploaded commit and completed Actions run |
| Public-site check | Run `node scripts/verify-deployment.mjs https://YOUR-REAL-SITE.vercel.app` |
| Authenticated Meta evidence | Unverified; not shown in the local demo |
| Organiser submission | Owner reviews the current portal and submits |

Use the original actual commit dates. Milestones 1–3 were recorded on 26 October; later feature iterations were implemented on 27 October. The numbered “days” are feature milestones, not evidence of nine separate days of activity. Planned work through 4 November is not a claim about future completed work.

## Neutral commit / PR wording

Title: `feat: prepare verified creative studio release and demo`

Description:

> Meta-only AdMorph AI: one-shot ads, shelf campaigns, seasonal copies and variants, six dialects with right-to-left support, and a guided demo, all on Muse Spark 1.3, SAM 3.1 and Muse Image 1.0 with the site's own server-side key. See README.md and BUILD_LOG.md for the checks and the live-verification record.

If the repo already exists, update the same repository using a branch/PR or normal commit. Preserve its `.git` directory and existing history; do not replace the repository or force-push.

## Final owner review

Open the deployed site in a private window. Open `/api/health` and check that `siteKeyConfigured` is `true`. Run **Watch the full demo**, then make one ad in Create, a Ramadan copy of it from the gallery, and a shelf campaign from the sample shelf. Switch to Arabic and reload. Verify public links without your own logged-in access. Local browser data does not transfer to the deployed origin.

Official event page: [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon). The public page was checked during release preparation; use the accepted-participant portal for current final submission fields and requirements.
