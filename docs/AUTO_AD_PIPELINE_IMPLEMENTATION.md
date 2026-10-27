# Auto-Ad Pipeline — Implementation Record

> Status: implementation record, not a claim that the features below already exist.
> Baseline: `main` at `5f8b5da` (Merge pull request #4), verified 2026-10-27.
> No open pull requests at baseline. No paid API calls are made by this record.

## 1. Goal and invariants

One-line pitch: AI creates the scene; AdMorph keeps the product real.

- The uploaded original product image stays immutable in local asset storage.
- Any cutout is derived from original RGB pixels plus a segmentation alpha mask.
  Scaling during composition is allowed; the transparent PNG source must retain
  source RGB where alpha > 0. Feathering changes alpha, not RGB.
- The image generator produces background only, never a full scene containing a
  reconstructed product. Background requests carry product-type metadata,
  palettes, mood and safe areas, not uploaded product pixels.
- No model-rendered typography or logos. Brand text and headlines are editable
  layers; Arabic RTL uses Cairo, English uses Inter. Brand/headline backgrounds
  are transparent by default; only a CTA capsule may intentionally have one.
- A no-key local demo must always work and must never be labelled as Meta output.
- Captions are editable text attached to each result, copyable and downloadable
  as TXT. The site does not post to social networks.
- Every result stays editable in the Konva editor, restorable from browser
  storage, and exportable as a 1080x1350 PNG.
- Product integrity is reported with verifiable checks, never with fabricated
  percentages or estimated conversion rates.

## 2. Verified module map (main @ 5f8b5da)

| Area | Verified paths |
|---|---|
| Brand Kit UI + storage | `src/components/brand-kit.tsx`, `src/lib/brand/theme.ts`, `src/lib/brand/backup.ts` |
| Campaign model + session | `src/lib/campaign/schema.ts`, `src/components/campaign-session.tsx`, `src/components/campaign.tsx` |
| Creative set + composer | `src/lib/editor/set.ts` (`buildCreativeSet`), `src/lib/editor/composition.ts`, `src/lib/editor/spatial.ts`, `src/lib/editor/safe-zones.ts`, `src/lib/editor/logo-placement.ts`, `src/lib/editor/schema.ts`, `src/components/creative-set.tsx`, `src/components/design-canvas.tsx` |
| Studio session + editor | `src/components/studio-session.tsx`, `src/components/studio.tsx`, `src/components/studio-tools.tsx` |
| Critic | `src/lib/critic/rules.ts`, `src/lib/critic/schema.ts`, `src/components/critic-panel.tsx`, `src/components/repair-panel.tsx`, `src/lib/repair/engine.ts` |
| AI transport + providers | `src/lib/ai/transport.ts`, `src/lib/ai/meta-transport.ts`, `src/lib/ai/meta-runtime.ts`, `src/lib/ai/task-support.ts`, `src/lib/ai/registry.ts`, `src/lib/ai/providers/meta.ts` |
| API routes | `src/app/api/ai/background/route.ts` (delegates to `handleBackgroundRequest` in `src/lib/ai/image-server.ts`), `src/app/api/ai/plan/route.ts`, `src/app/api/ai/shift-copy/route.ts`, `src/app/api/ai/product-makeover/route.ts`, `src/app/api/ai/critic/route.ts`, `src/app/api/providers/task-test/route.ts`, `src/app/api/health/route.ts` |
| Storage | `src/lib/db/dexie.ts`, `src/lib/db/schema.ts`, `src/lib/db/repository.ts` |
| Messages | `src/messages/ar.json`, `src/messages/en.json` (parity required) |
| Deployment | `vercel.json` (`npm ci` install, `npm run build`); production domain `https://admorph-ai-app.vercel.app` |

Verified facts that constrain the build:

- Meta task catalog (`task-support.ts`) is exactly
  `planner, image, critic, edit, vision, image_edit, copy`. There is **no
  `segment` task**, so a Meta SAM adapter is conditional and must not be
  invented. If SAM stays unverified, PR1 ships the local cutout only and the
  Meta path is labelled unavailable.
- Layer schema (`editor/schema.ts`) currently requires `fill` to be a hex
  color. Text `color` is a separate field, so widening `fill` to
  `hex | 'transparent'` (PR3) does not make text itself transparent, and
  legacy hex records must stay valid.
- Asset kinds (`db/schema.ts`) are currently `logo | product | background`.
  PR1 adds an optional `cutout` kind plus provenance metadata; no store is
  dropped and no destructive reset is allowed.
- The background route is a thin stub over the Meta `image` task. PR2 extends
  its validated input with a `BackgroundBrief`; the local path must use brand
  colors (audit item: the local gradient was unverified against brand colors).
- Messages are bilingual with parity. Every new user-facing string needs both
  `ar.json` and `en.json` entries.

## 3. Workflow and feature flag

Auto-ads work lands behind an unlinked route until PR4 is complete and
verified, and it is not linked from the main navigation until PR6 enables it
by default. Incomplete automation must never become the landing default.
If `main` auto-deploys on every merge (Vercel project above), each merged PR
gets its own production smoke check; on a severe regression, roll back to the
last known-good deployment before merging the next PR. Never rewrite pushed
history or force-push.

## 4. PR order

- PR0 (this record): baseline integration, AGENTS.md publication update,
  module map, fixtures, stale sample-page copy fix. No live requests.
- PR1: cutout provider + local segmentation + provenance + schema.
- PR2: `BackgroundBrief`, product/brand analyzer, background-only route
  extension, three presets, local brand-color gradient.
- PR3: transparent text schema, composer fit/layout/shadow, logo placement,
  font integration, PNG export accuracy.
- PR4: single-run orchestrator (preflight, one combined consent, progress
  state machine, cancellation/retry, run persistence, one hero output).
- PR5: copy/captions, results grid, background-only regenerate, ZIP export
  of the result set (PNGs + caption TXT files).
- PR6: integrity Critic, E2E, accessibility/responsive/AR-EN parity, enable
  by default, release report, production smoke.

Pending audit items are folded in, not duplicated: stale sample text (PR0),
product cutout (PR1), local background brand colors (PR2), ZIP export (PR5).

## 5. Verification gates (every PR)

Node 24.x, locked dependencies: `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`. Playwright E2E (`npm run test:e2e`) and the
production smoke script (`npm run test:production`) run where the runtime
supports them; any gate that cannot run is documented with its replacement,
never silently claimed as passed. Targeted unit tests cover every new
adapter, schema, mask routine, composer rule, copy path, state machine and
critic check. After changing AI request schemas, restart the owned dev server
and exercise an actual local HTTP request against the validation route;
mocked tests alone can miss stale server modules.

## 6. Known blockers and limits (honest, at PR0)

- Meta SAM: endpoint, model ID, request/response shape and price are
  unverified. No billable Meta call is made during implementation without
  separate explicit owner consent. Meta integration status stays
  NOT LIVE-VERIFIED until an opt-in live test with cost disclosure happens.
- Vercel connector has no team scope in this environment, so deployment is
  verified through the GitHub auto-deploy + live production URL checks, not
  through the connector dashboard.
- No login, billing, teams, server database, automatic social posting,
  campaign analytics, video generation, brand-URL scraping, or conversion
  scores are built in this program.
- Hackathon submission is never performed as part of this program; it needs
  a separate explicit owner instruction.
