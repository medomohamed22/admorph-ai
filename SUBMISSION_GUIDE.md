# AdMorph AI — owner submission guide

## Project description

**AdMorph AI turns one product and a Brand Kit into three editable bilingual campaign designs, then explains measured layout problems and previews safe, undoable repairs.**

The working local flow includes separate offer/benefit/lifestyle layouts, English/Arabic text layers, full-size PNG and caption exports, browser-local persistence, optional Gemini BYOK planning/background/review/repair adapters, and separate Meta text/image smoke adapters. Local templates and measured repair work without provider keys. No shared owner-funded generation key is used.

## Review the evidence

- `docs/demo/AdMorph-demo.mp4`: actual app footage with English chapter annotations; silent, matching SRT supplied.
- `docs/demo/recording.json`: actual recording time, chapters, dimensions and no-paid-call boundary.
- `docs/demo/three-designs.png`: real three-design gallery.
- `docs/demo/repair-comparison.png`: actual full-resolution before/after canvas comparison.
- `docs/demo/settings.png`: safe empty-key Settings state.
- `docs/evidence/`: dated local production/development checks. Historical reports retain their original dates/versions.
- `DAY9_VALIDATION.md`: release checks and package-verification limits.

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

> Complete the bilingual three-design workflow with editable layers, measured repair previews, persistent undo snapshots and safe BYOK controls. Add local demo assets, release integrity checks, production browser CI and manual deployment instructions. Authenticated paid-provider access and remote publication are documented separately from local verification.

If the repo already exists, update the same repository using a branch/PR or normal commit. Preserve its `.git` directory and existing history; do not replace the repository or force-push.

## Final owner review

Open the deployed site in an incognito browser. Create a local sample, approve/build/export all three designs, switch to Arabic and reload, then verify repair/undo and blank-key consent guards. Verify public links without your own logged-in access. Local browser data does not automatically transfer to the deployed origin; only Brand Kit export/import is currently portable.

Official event page: [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon). The public page was checked during release preparation; use the accepted-participant portal for current final submission fields and requirements.
