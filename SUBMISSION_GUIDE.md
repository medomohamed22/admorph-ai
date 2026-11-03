# AdMorph AI — owner submission guide

## Project description

**AdMorph AI turns one phone photo of a product (or of a whole shelf) into finished, Instagram-ready ads in the shop owner's dialect, using three Meta models: Muse Spark 1.3 reads, writes and reviews; SAM 3.1 cuts the product out; Muse Image 1.0 paints.**

Current flows: a five-step one-shot studio; shelf to campaign (a photo or short video, one ad per product); seasonal copies and variants of a saved ad that keep the logo and icons where they were; six copy dialects with right-to-left support; and a guided demo that runs the whole site. The site uses its own Meta key, set on the server as `META_API_KEY`; visitors enter no key. Brands, ads and drafts stay on the device (IndexedDB). See `README.md`, `HACKATHON.md`, `BUILD_LOG.md` and the `/hackathon` page for the current state; the evidence list below comes from an earlier, local-only version (27 October).

## Review the evidence

- The live site: <https://admorph-ai-app.vercel.app/>. **Watch the full demo** on the home page runs the whole site with real Meta models.
- `/api/health` on the live site: status, whether the site key is configured (never the key) and the three model ids.
- `BUILD_LOG.md`: every change with its checks, and the live runs on the production site (30 October to 3 November).
- `docs/screens/`: screenshots of the current site used in the README.
- `docs/archive/` and `docs/evidence/`: reports and check results from earlier versions. They keep their original dates and describe features that have since been replaced.

## Owner fields to complete after publication

| Field | Current state |
| --- | --- |
| Public GitHub repository URL | <https://github.com/medomohamed22/admorph-ai> (public, MIT license) |
| Public Vercel Production URL | <https://admorph-ai-app.vercel.app/> |
| Video hosting/share URL | https://youtu.be/uqqkS3A2vfA (public; opens without signing in) |
| Commit SHA | The merge commit on `main` that Vercel deployed to production |
| Public-site check | Run `node scripts/verify-deployment.mjs https://admorph-ai-app.vercel.app` |
| Live Meta evidence | The live-run entries in `BUILD_LOG.md` |

Use the original actual commit dates. Milestones 1–3 were recorded on 26 October; later feature iterations were implemented on 27 October. The numbered “days” are feature milestones, not evidence of nine separate days of activity. Planned work through 4 November is not a claim about future completed work.

## Neutral commit / PR wording

Title: `feat: prepare verified creative studio release and demo`

Description:

> Meta-only AdMorph AI: one-shot ads, shelf campaigns, seasonal copies and variants, six dialects with right-to-left support, and a guided demo, all on Muse Spark 1.3, SAM 3.1 and Muse Image 1.0 with the site's own server-side key. See README.md and BUILD_LOG.md for the checks and the live-verification record.

If the repo already exists, update the same repository using a branch/PR or normal commit. Preserve its `.git` directory and existing history; do not replace the repository or force-push.

## Final owner review

Open the deployed site in a private window. Open `/api/health` and check that `siteKeyConfigured` is `true`. Run **Watch the full demo**, then make one ad in Create, a Ramadan copy of it from the gallery, and a shelf campaign from the sample shelf. Switch to Arabic and reload. Verify public links without your own logged-in access. Local browser data does not transfer to the deployed origin.

Official event page: [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon). The public page was checked during release preparation; use the accepted-participant portal for current final submission fields and requirements.
