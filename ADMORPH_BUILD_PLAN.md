# AdMorph AI — Build, Run & Deployment Master Plan

> **Version:** 1.0 — 26 October 2026  
> **Audience:** Solo beginner developer using Codex on Windows  
> **Target:** Local Windows development first → GitHub → Vercel  
> **Deadline planning:** 27 October–4 November 2026 (verify the official hackathon portal deadline).  
> **Document role:** Product requirements + technical architecture + test criteria + actionable Codex implementation plan.  
> **Status:** Specification, **not** an already built application.

## 0. Product summary

**AdMorph AI** is an English-first, fully bilingual (English/Arabic) responsive creative studio that creates *three distinct, brand-consistent ad creatives and captions* from a product image and a short brief. The user can review campaign ideas before image generation, edit editable layers, and run an AI **Critic → proposed fixes → user-approved application → verification** loop.

For initial experimentation, the user chooses the AI provider/model at runtime in **Settings**. Supported providers: **Meta Model API**, **Google Gemini API**, **OpenRouter**, and **Custom OpenAI-compatible endpoint**. Start testing with Gemini; later switch to Meta Muse for hackathon demonstration. The default interactive demo must work even when no API key exists.

**Key differentiators:** portable AI-assisted Brand Kit; brand colors applied to the workspace UI; 3-concept campaign; English/Arabic typography as real editable layers; automatic design checks with explainable, undoable auto-fixes; interchangeable AI providers; offline-friendly browser-local project library.

**Do not build:** billing, login, team collaboration, publishing to Instagram, complex analytics, server database, complete Canva clone, video rendering.

## 1. Decisions locked in

1. Landing page shows a **fully interactive sample campaign** (not misleading fake generation); entry action is **Create your Brand**.
2. Brand Kit requires **name, optional logo, three colors, short description**; an AI button suggests palette and copy; all suggested values are editable.
3. A new campaign requires **product image + short text brief**, plus optional language/format; AI creates **3 different concepts and captions**. User can approve/edit concepts **before** image generation.
4. Automatic **Critic review** after each creative; display issues and explanations; **Apply fixes** only on user action. Undo/compare before vs after.
5. Editor supports **dragging elements, editing text, colors and font selection**, as well as constrained AI-generated edit commands.
6. **All UI labels, notifications, forms, tooltips, error states, settings, and demo copy** must have English and Arabic translations. **English (`en`) default** on first visit; toggle to Arabic (`ar`) under Settings; store choice locally; RTL when Arabic.
7. Layout supports desktop and mobile touch input. The editor uses adaptive panels and pinch/zoom if practical; avoid horizontal page overflow.
8. The app saves settings, Brand Kits, campaigns, source images, generated backgrounds, creative layer definitions, and history locally in the **same browser on the same origin**; export/import for data portability.
9. Deployment is public for demo, while real generation is behind a **server-enforced access code / usage limit**. **User-entered API keys require a separate explicit BYOK flow** and must never be committed.
10. Local Windows browser testing **before** GitHub/Vercel, then production-ready ZIP and GitHub repository in a *later phase*; this document alone is the deliverable now.

## 2. First-time user journey

```text
Landing + sample interactive demo (no key required)
  ├── Explore sample → edit demo creative / see before-after
  └── Create Your Brand
       → Name + logo + 3 colors + description
       → Optional AI Suggestions (requires configured model)
       → Theme updates instantly
       → Save brand to IndexedDB + Export Brand Kit
       → New Campaign
            → upload product + short campaign brief
            → choose creative language and output size
            → select models automatically from saved provider roles
            → Planner proposes 3 marketing angles + 3 captions
            → user edits/approves the concepts
            → generate background(s) / composite originals + editable layers
            → automatic validation + AI Critic
            → issues + reasons + Apply Fixes / Undo / Compare
            → download PNGs + captions (+ optional campaign ZIP)
```

**No login in V1.** Returning users see their locally saved brands and recent campaigns. If storage is unavailable, allow an ephemeral session and show export warning.

## 3. Routes / wireframes (build mobile-first)

### `/` — Landing + Demo
- Top nav: AdMorph logo, Explore Demo, Create Brand, Settings icon, language indicator.
- Hero: concise headline, two CTAs.
- Three sample creatives using bundled local assets; select one and edit headline/colors to prove the UI works without an API.
- A small explainable Critic before/after demo with real local rule checks.
- Footer: "Demo uses sample data — live generation requires a provider".

### `/brands` and `/brands/new` — Brand Kit
- Brands library cards; Create / Import / Export.
- Fields: name, description, logo upload, three HEX colors; optional detected palette suggestion.
- Live theme preview of sidebar, active tabs, buttons and campaign preview.
- Theme safety: enforce readable contrast, do **not** use unreadable brand colors for all body text or destructive actions.
- Brand export (`brand-kit.json` plus embedded logo as data URL for small logos **or** a ZIP with file references for bigger assets). Version the schema.

### `/campaigns/new` — Campaign Creation
- Product image upload/preview, short brief, primary goal, creative language (`en`/`ar`), format (start with 1080×1350).
- Planner model chosen in Settings; show current provider/model and "Change in Settings" link.
- 3 editable concept cards: title, audience angle, headline, caption, visual direction.
- Approve and generate *one creative at a time*; keep successful partial results if one fails.

### `/studio/[id]` — Creative Workspace
- Desktop: left sidebar for campaign/creatives; central canvas; right editor/critic panel.
- Mobile: canvas on top, bottom tabs for **Layers / Edit / Review / Export**; comfortable touch targets.
- Elements: background, product layer, logo, headline, CTA; drag/resize text and logo/product where supported.
- Select creative, edit typography and colors, choose from bundled EN/AR fonts, undo/redo, compare before/after.
- Automatic rules → issues and explanations; AI Critic suggestions; apply a safe, schema-validated fix plan; confirm improvement using objective checks; preserve previous state.

### Settings drawer or `/settings`
Sections: **Language**, **AI Providers**, **Model Roles**, **Storage & Backup**, **Generation Protection**, **About**.

```
Settings
  Language: [ English ▼ ]     (English default; Arabic available)

  AI Providers
  [Meta] [Gemini] [OpenRouter] [Custom]
  Provider: Gemini
  API key: [••••••••] [show/hide] [Test connection]
  Base URL: https://...        (read-only presets; editable custom only)
  [Fetch models] [Search models...]
  Filters: [All / Text / Vision / Images] [Available only]
  Roles:
    Planner       [model selector]
    Image maker   [model selector]
    Critic        [model selector]
    Edit command  [model selector]
  [Save Settings]  [Clear Key]

  Storage
  Used: ~XXX MB   (real estimate if browser supports it)
  [Request persistent storage] [Export backup] [Import backup]
  [Delete sample cache] [Delete all local data]
```

**No dead controls:** every visible setting/button must either work or be explicitly disabled with an honest description.

## 4. Provider abstraction — critical technical requirement

### 4.1 Provider preset table

| Provider | Default API base | Fetch models | Text/vision | Image generation | Notes |
|---|---|---|---|---|---|
| Meta | `https://api.meta.ai/v1` | `GET /models` | Muse Spark family | Muse Image (separate images API) | Verify account access and per-model capabilities; SAM optional later |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | `GET /models` (pagination) | Models supporting `generateContent` | Image-capable Gemini models; distinct response format | Not all list entries generate images |
| OpenRouter | `https://openrouter.ai/api/v1` | `GET /models` | Model-dependent | Only model/route combinations that support image outputs | Use modality metadata, do not assume image support from name |
| Custom | User-provided HTTPS OpenAI-compatible base | Try `/models`; manual ID fallback | Only supported endpoints | Only if compatible and capability verified | No promise that every custom server supports images |

Official model APIs and capability flags must be checked during implementation rather than hardcoding a short list of possibly retired model IDs. The **model catalog fetch must work with retries, loading/error/empty states, and filtering**.

### 4.2 Define provider capabilities, not merely a single model dropdown

```ts
type ProviderId = 'meta' | 'gemini' | 'openrouter' | 'custom';
type ModelRole = 'planner' | 'image' | 'critic' | 'edit';
type ModelCapability = 'text' | 'vision' | 'image_output' | 'structured_output';

type ModelInfo = {
  id: string;
  name: string;
  provider: ProviderId;
  capabilities: ModelCapability[];
  description?: string;
  contextWindow?: number;
  pricingNote?: string;
};

type RoleSelection = {
  planner: { provider: ProviderId; modelId: string };
  image: { provider: ProviderId; modelId: string } | null;
  critic: { provider: ProviderId; modelId: string };
  edit: { provider: ProviderId; modelId: string };
};
```

**Why model roles matter:** Gemini text may plan a campaign while Meta Muse Image generates a background and another model critiques it. Allow **one provider for all roles** as quick setup and **Advanced: per-role provider/model** for experimenting. On V1, offer a single provider preset + roles and hide advanced mixing behind an expander.

### 4.3 Provider architecture

```text
UI / Settings
   ↕ ProviderRegistry + capability-filtered ModelCatalog
   ↕ AIService: planCampaign / generateBackground / critique / interpretEdit
   ├── GeminiAdapter        (Google-specific request / response mapping)
   ├── MetaAdapter          (chat/responses + separate image endpoints)
   ├── OpenRouterAdapter    (OpenAI-like chat + modality restrictions)
   └── CustomAdapter        (OpenAI-compatible subset only)
   ↕ normalized schemas (Zod)
Campaign + Canvas Composer + Critic Engine
```

Adapters must normalize provider outputs to internal schemas; **never** assume Gemini, Meta Images, and OpenRouter use exactly the same request/response format. Return actionable messages for unsupported modalities, 401, 403, 429, API quota, invalid model, timeout, and CORS.

### 4.4 Example catalog fetch design

- Server-owned provider calls to known official hosts: `POST /api/providers/models` with `{ providerId }`, optionally `{ credentialSession }` for explicitly authorized temporary BYOK handling.
- Meta: `GET https://api.meta.ai/v1/models` (Bearer token).
- Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models` with authorized API key, follow `nextPageToken`; filter by supported methods and image capabilities.
- OpenRouter: `GET https://openrouter.ai/api/v1/models` (authorized when needed); use input/output modality metadata.
- Custom: prefer **browser-direct** calls only if CORS is enabled; for V1 custom requests to arbitrary hosts **must not** be forwarded by a publicly accessible Vercel server proxy. Keep custom endpoint locally restricted or disabled in public deployment until SSRF defenses are implemented.
- UI: Debounced search; filters Text/Vision/Image; capability badges; manual model ID fallback; last successful catalog cached in IndexedDB with timestamp, never present cached results as freshly verified.

### 4.5 Connection testing

1. Select provider, enter key, click **Test connection**.
2. Check key validity and list models with a low-cost request. Avoid paid generation during "Test" unless user explicitly asks.
3. Show status + available model count or helpful reason for failure.
4. Select models per role. Prevent assigning a text-only model to image generation.
5. Save selection locally; user can switch providers without losing past campaigns.

## 5. Security architecture — user-entered keys are sensitive

**Important warning:** Browser-only local persistence can reduce accidental exposure but cannot guarantee API key secrecy against XSS, browser extensions, malware, shared devices, or malicious scripts. Do not state that local encryption makes keys perfectly safe.

Two explicit modes:

**A. Local BYOK testing mode (first build)**
- API credentials are entered by the user and held **in memory by default**.
- Offer **Remember on this device** only as explicit opt-in, with passphrase-based encryption using Web Crypto (PBKDF2 or strong KDF + AES-GCM) before IndexedDB persistence. Prompt for passphrase on reload; never persist the decryption passphrase or plaintext key. This protects at-rest backups better but not against active XSS. Offer "do not remember key" as default.
- When using known providers, credentials may transit through a trusted local Next.js Route Handler to call the official provider; the handler **never logs or stores credentials**. Warn clearly that in a deployed environment the key is temporarily transmitted to the application's server; don't claim it stays strictly in the browser.
- Do not include credential material in analytics, crash reports, query parameters, debug logs, exports, local sample data, or Git history. Avoid localStorage for API keys.
- Any Custom Base URL must be validated as HTTPS on public web, with no credentials to untrusted endpoints accidentally. Warn that the endpoint operator receives the key/data.

**B. Public judge/demo mode**
- Default no-key demo with sample assets.
- Server-managed provider keys live only in `.env.local` or Vercel Environment Variables (no `NEXT_PUBLIC_`).
- Live generation protected by **real server-side access codes plus rate limiting/budget** (server-side state store needed, e.g. Upstash Redis or equivalent). Without such a store, disable public server-owned generation and keep BYOK-only mode.
- The code **must not** allow arbitrary upstream URL forwarding (SSRF), unlimited model spend, or arbitrary client override of server keys.
- If working on the hackathon, verify specific sponsor/model-usage requirements and demonstrate actual Meta calls, not only Gemini.

## 6. Browser-local large storage — IndexedDB, not localStorage

Use **Dexie (IndexedDB)** for structured records and media `Blob`s; `localStorage` only for tiny preferences such as chosen language (or keep preferences in Dexie). Possible browser OPFS use in the future for very large files, but **do not implement OPFS in V1** unless real performance tests require it.

### 6.1 Suggested tables

```ts
// Dexie schema — illustrative entities
settings: 'key'
providerConfigs: 'id'     // no plaintext secrets
brands: 'id, updatedAt'
campaigns: 'id, brandId, updatedAt'
creatives: 'id, campaignId, updatedAt'
assets: 'id, kind, createdAt' // Blob payloads
editHistory: 'id, creativeId, createdAt'
modelCatalogCache: 'providerId, fetchedAt'
```

- Keep **Blob** assets separate from editable metadata; use asset IDs, not giant base64 JSON strings inside campaigns.
- Generate object URLs on demand and revoke after use.
- Debounce autosave; display Saving / Saved / Storage error states.
- `navigator.storage.estimate()` shows an **estimate** of quota/usage; use `navigator.storage.persist()` for optional best-effort persistence request; browsers may deny. Never promise "unlimited storage" or exact quotas.
- Private/incognito tabs, browser storage cleanup, device migration, and origin changes (e.g., `localhost` vs Vercel URL) may cause data to be missing. Storage is **per browser/profile/device/origin**, NOT synced between phone and desktop.
- Ensure settings, campaigns and images survive reload in the *same* origin. Device changes require export/import backup.
- Storage fallback when full: compress large imported images or prompt user to export/delete older assets, but **never silently delete original work**.

### 6.2 Backup/restore

- **Brand Kit export/import** is V1 must-have (versioned JSON + logo data or archive).
- Full project backup is V1.1 stretch: portable ZIP containing versioned `manifest.json`, brand/campaign/creative JSON and image assets. **Never include API keys, passphrases or access codes in exports.**
- Import validates schema, file types, asset size and archive limits. Use conflict-safe new IDs and warn before overwrite.
- Use `JSZip` dynamically on user action if ZIP export is needed, and avoid creating huge ZIP in low-memory phones. For large projects, incremental export or smaller assets is safer.

## 7. Internationalization (i18n) and mobile UX

- Initial language: `en` unless a saved user preference exists. **Do not automatically switch to Arabic based on device locale.**
- Language toggle in Settings (`English`, `العربية`), applies immediately without losing edits; persist selection locally.
- Dictionary files `messages/en.json` and `messages/ar.json`; key-based translation in all app screens, including validation and loading states. Use `next-intl` (or similarly well-supported solution) with a stable routing plan; no need for separate `/en` and `/ar` URLs in MVP if language is stored client-side.
- `dir="ltr"` for English, `dir="rtl"` for Arabic; use logical CSS properties (`margin-inline-start`, etc.), and ensure icons/layout are correctly mirrored where appropriate.
- Text inside **the exported creative** can be English or Arabic independently of UI language.
- Bundle fonts with licenses appropriate for distribution, e.g. locally served **Inter** / **Cairo** or **Tajawal**; do not rely on AI image models to render Arabic headlines.
- Breakpoints conceptually: phone `320–767px`, tablet `768–1023px`, desktop `1024px+`. Touch friendly buttons >= about 44 CSS px; avoid hover-only controls; horizontal-scrollable concept cards where sensible, not entire page.
- Canvas on mobile: viewport-fit stage, zoom/pan, no clipped export, correct drag coordinates; test iPhone Safari and Android Chrome where possible.
- All controls keyboard-accessible with labels and visible focus; preserve readable contrast even if selected brand colors are poor.

## 8. Creative & Critic implementation

### 8.1 Campaign data

```ts
type CampaignConcept = {
  id: string;
  angle: 'offer' | 'benefit' | 'lifestyle';
  headline: string;
  caption: string;
  visualDirection: string;
  approved: boolean;
};

type Creative = {
  id: string;
  campaignId: string;
  backgroundAssetId: string | null;
  layers: EditableLayer[]; // text, image, logo, rect / CTA
  review: ReviewIssue[];
  version: number;
};
```

### 8.2 Generate

- Planner returns exactly 3 *meaningfully different* concepts in JSON validated with Zod.
- User approves before image generation. Start with one creative; grow to all three; sequential calls to limit rate/spend.
- Prefer **generate background without text**, add product/logo/headline/CTA in editor. This ensures exact text and stable logo. Product preservation via image compositing/cutout is optional stretch; plain photo compositing is sufficient for V1.
- Use Konva/React Konva for editable layers + export. For cross-origin external images, convert through trusted fetch to local Blobs carefully to avoid tainted canvas; never expose a generic public download proxy.

### 8.3 Critic & safe repair

1. Generate layout object, render preview.
2. **Deterministic rules** check clipping, boundaries, text-vs-background contrast (approximation with sampled backdrop), overlapping logo/headline, missing required copy, output dimensions.
3. Model-based Critic reviews image/metadata where supported and suggests **specific allowed actions**, never arbitrary generated JS.
4. Validate JSON using Zod allowlist, e.g. `move_layer`, `resize_layer`, `set_color`, `set_font_size`, `set_text`, `add_backdrop`; clamp positions, sizes and color fields.
5. Present rationale + before/after. User selects **Apply fixes**, then re-run deterministic checks; automatic maximum of **two** review iterations if needed. Add Undo.
6. UI should distinguish objective checks from subjective AI feedback; no fake promised CTR/performance score.

**Hackathon demo wow moment:** A visibly clipped Arabic headline is detected; user clicks Apply Fixes; headline moves inside canvas and contrast is adjusted; side-by-side comparison shows the change and passing rules.

## 9. Recommended stack

- **Next.js App Router + TypeScript**; React; Tailwind CSS; shadcn/ui + Lucide icons.
- **IndexedDB via Dexie**; Zod validation.
- **React Konva** for the design editor (client-only dynamic component where SSR causes issues).
- **next-intl** or equivalent for translations; English default.
- **Web Crypto** for opt-in encrypted local credentials; never store plaintext keys.
- **Vitest** (unit) + **Playwright** (browser smoke tests) with English/Arabic mobile viewport checks.
- **JSZip** only when implementing backup ZIP.
- Single Next.js repo; Node runtime API routes; no separate Python/FastAPI server in V1.

## 10. Proposed repository tree

```text
admorph-ai/
├── app/
│   ├── page.tsx
│   ├── brands/page.tsx
│   ├── brands/new/page.tsx
│   ├── campaigns/new/page.tsx
│   ├── studio/[id]/page.tsx
│   ├── settings/page.tsx
│   └── api/
│       ├── health/route.ts
│       ├── providers/models/route.ts
│       ├── providers/test/route.ts
│       ├── ai/plan/route.ts
│       ├── ai/image/route.ts
│       └── ai/critique/route.ts
├── components/
│   ├── ui/
│   ├── settings/
│   ├── brand/
│   ├── campaign/
│   ├── studio/
│   └── demo/
├── lib/
│   ├── ai/providers/{meta,gemini,openrouter,custom}.ts
│   ├── ai/{registry,capabilities,schemas}.ts
│   ├── db/{dexie,schema,backup}.ts
│   ├── security/{credentials,rate-limit}.ts
│   ├── i18n/
│   ├── editor/{layers,history,checks,fixes}.ts
│   └── utils/
├── messages/{en,ar}.json
├── public/demo/
├── tests/{unit,e2e}/
├── .env.example
├── .gitignore
├── AGENTS.md
├── README.md
└── package.json
```

## 11. Windows local development + Codex steps

### 11.1 Install prerequisites

Install **Node.js LTS**, **Git**, **VS Code** (optional), and **Codex CLI**. Use official installers, or on a supported Windows machine PowerShell:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
winget install --id Microsoft.VisualStudioCode -e
```

Restart PowerShell, check:

```powershell
node --version
npm --version
git --version
```

For Codex use the current official Windows installer (review command from official documentation before running it):

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
codex --version
```

Alternative when Node is installed: `npm install -g @openai/codex`.

### 11.2 Initialize app and launch first server

```powershell
mkdir C:\Projects\admorph-ai
cd C:\Projects\admorph-ai
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
npm run dev
```

Visit **http://localhost:3000** on Windows. Stop with `Ctrl+C`.

> If the chosen project structure uses `src/`, place `app`, `components`, `lib`, `messages` under `src/` and adjust imports accordingly. Do not create duplicates in both root and `src`.

### 11.3 Run Codex from project folder

```powershell
cd C:\Projects\admorph-ai
codex
```

Ask Codex to read this file and implement **one milestone at a time**. Keep default approval/sandbox controls enabled. Codex can execute `npm run dev` locally, but the user still opens the browser to check visual/mobile behavior. Use `git status` and commit after each accepted milestone.

### 11.4 Local environment

Create `.env.local` **only if needed for owner-managed testing**:

```dotenv
# Example names only; no actual secrets committed
META_MODEL_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=
# For optional protected public generation:
DEMO_ACCESS_CODE_HASH=
# Add durable rate limiter configuration once enabled
```

`.env.local` must be in `.gitignore`, and `.env.example` contains placeholder names **only**. BYOK user-entered credentials in Settings do not require filling every server key.

### 11.5 Commands to check locally

```powershell
npm install
npm run dev
# in another terminal
npm run lint
npx tsc --noEmit
npm run build
```

Add `npm run test` and `npm run test:e2e` once tests/scripts exist. Tests that use real paid APIs must be explicitly opted into and never run by default.

### 11.6 Test on phone on same Wi-Fi (local development only)

```powershell
npm run dev -- --hostname 0.0.0.0
ipconfig
```

Find the Windows Wi-Fi IPv4 address, then visit `http://<YOUR-PC-LAN-IP>:3000` from the phone. Ensure devices are on the same network. A Windows firewall prompt may need to be allowed for **private networks only**. Do not expose the dev server to the public Internet. Test plain UI/storage; Web Crypto secure-context-only features may differ on LAN HTTP vs localhost or production HTTPS.

## 12. Nine-day execution milestones (each with acceptance criteria)

| Day | Date | Build task | Done when |
|---|---|---|---|
| 1 | Oct 27 | Create Next.js, demo landing, page shell, English translations, health route, run Windows localhost | English demo loads on desktop + phone viewport, `/api/health` OK |
| 2 | Oct 28 | Settings UI, provider registry, key handling, fetch/test models, search/filter/roles | Fetch Gemini catalog, select text model; errors and no-key state work |
| 3 | Oct 29 | Dexie storage, language switching, Brand Kit + theme + export/import | Settings and brand survive reload; Arabic RTL complete for existing screens |
| 4 | Oct 30 | Campaign form + Gemini planner + concept approval | 3 schema-valid distinct ideas editable before generation |
| 5 | Oct 31 | Image adapter (Gemini initially), editable Konva layer composer, PNG export | At least one generated and exported branded creative works |
| 6 | Nov 1 | Critic deterministic checks + AI review + explanation | Detect test cases; explain issues without fabricated certainty |
| 7 | Nov 2 | Safe auto-fix + undo + compare; Meta provider smoke tests | Before/after improvement, Meta test requests when credentials enabled |
| 8 | Nov 3 | Third creative flow, mobile polish, secure BYOK/demo public behavior, tests | Full 3-creative demo, settings safe, responsive; fresh-browser smoke tests |
| 9 | Nov 4 | README, screenshots, video, GitHub, Vercel, final production checks | Live URL + repo + valid demo submission, no leaked secrets |

**Priority fallback:** If behind schedule after Day 5, focus on **one excellent end-to-end ad + Critic/auto-fix + two additional concept previews**; do not sacrifice a real running core just to claim all features. Do not add SAM until provider switching, core editor and Critic work.

## 13. Acceptance test matrix

- [ ] Fresh browser opens in **English**.
- [ ] Switching to Arabic changes all visible UI copy + RTL; refresh preserves language.
- [ ] Landing sample works entirely offline / without API key.
- [ ] On 375px mobile and 1440px desktop, no page-wide horizontal overflow or inaccessible navigation.
- [ ] Settings shows four providers (Meta, Gemini, OpenRouter, Custom).
- [ ] Every provider has a clear connection status and supported/unsupported capabilities.
- [ ] Fetching model lists works for credentials that have access; search and Text/Vision/Image filters work.
- [ ] Selecting text-only model for Image role is rejected with helpful message.
- [ ] Custom endpoint refuses insecure URL and public server SSRF-prone forwarding.
- [ ] API key never appears in Git, local project exports, logs, query string or frontend bundle.
- [ ] Optional persisted key cannot be decrypted without user passphrase; "clear keys" wipes stored encrypted blob.
- [ ] Brand name, logo, colors and description survive same-browser refresh.
- [ ] Brand Kit export/import round trip retains logo and all palette values.
- [ ] Images and creatives use IndexedDB Blobs; app survives reload at same origin, within browser storage availability.
- [ ] Storage usage indicator is labeled approximate; quota/persistence failure is handled gracefully.
- [ ] Changing from Gemini to Meta does not delete old campaign data.
- [ ] Planner generates exactly three different concepts with meaningful differences.
- [ ] User approves concepts before paid image requests.
- [ ] Can edit text/drag image layers on mouse and touch and export a correct PNG.
- [ ] Critic detects intentionally clipped headline; fix moves it; undo restores it.
- [ ] Unknown or malicious AI fix command is rejected by schema/allowlist.
- [ ] Generate API cannot be called unlimited times on public server-owned credentials.
- [ ] `npm run build`, lint and typecheck pass; secrets absent from exported ZIP.

## 14. GitHub and Vercel — AFTER localhost MVP

1. Ensure clean source and successful `npm run build`; add `README.md`, screenshots, `.env.example`, license and `.gitignore`.
2. `git init`, commit, create remote GitHub repository, push `main`. Keep keys and generated local app data out of source.
3. Import GitHub repo into Vercel; Next.js framework preset; set server-owned environment variables in Vercel dashboard, only if needed. Preview and Production env can differ.
4. Deploy; verify homepage, navigation, language toggle, IndexedDB persistence on production origin, model listing, and controlled generation.
5. Store sample demo images as small optimized files under `public/demo` (not paid API generated on every visit).
6. Browser-local data from `http://localhost:3000` will **not automatically appear** in `https://your-app.vercel.app`; use export/import.
7. Later create a **source ZIP**, containing app source/config/docs/assets only (no `node_modules`, `.next`, `.git`, `.env.local`, passwords or real keys). For Vercel the recommended method is **GitHub integration**, not ZIP upload; ZIP is a shareable source snapshot.
8. Never write user API keys into Vercel Environment Variables: those are owner/server keys, not individual user BYOK keys.

### ZIP release manifest (later, not delivered now)

```
admorph-ai-source.zip
  app/ or src/app/
  components/ or src/components/
  lib/ or src/lib/
  messages/
  public/
  tests/
  package.json
  package-lock.json
  next.config.*
  tsconfig.json
  .env.example
  .gitignore
  AGENTS.md
  README.md
  ADMORPH_BUILD_PLAN.md
```

## 15. Codex working agreement (`AGENTS.md` draft)

> Use this section as the basis of `AGENTS.md` once project exists.

- Read `ADMORPH_BUILD_PLAN.md` before changes. Work on one milestone/task at a time.
- Never call an API or use paid generation without explicit approval or a visible user-triggered action.
- Never store or log secret API keys in plaintext; no secrets in commits, fixtures, exports, or `NEXT_PUBLIC_` variables.
- Default UI language is English; maintain translation parity with Arabic for all new strings.
- All features must work on mobile and desktop, with keyboard focus and touch-friendly controls.
- Use IndexedDB for large browser assets, not `localStorage` for blobs or base64 images.
- Keep provider implementations separate and capability-aware; Gemini and Meta Image are NOT assumed wire-compatible.
- Parse all model-generated structured results with Zod; validate and clamp auto-fix actions.
- Include loading/error/empty states; no fake working buttons or fake API test success.
- After changes, run lint, typecheck, unit tests (if available), and build; report exact results.
- Do not rewrite large unrelated files or introduce backend databases without a documented reason.
- Commit small, reversible changes. Provide manual test steps for each delivered feature.

### First Codex instruction (copy/paste)

```text
Read ADMORPH_BUILD_PLAN.md carefully and implement Day 1 only.
I use Windows PowerShell and want the app running at http://localhost:3000.
Create the Next.js foundation, responsive English-first landing with a real interactive mock demo, navigation shells for Brand Kit, Campaigns, Studio and Settings, translation dictionary skeleton for English and Arabic, and /api/health.
Use local mock data; do not call AI APIs or implement paid generation yet.
Do not hardcode any API key. Add AGENTS.md based on section 15 of the plan.
At the end, run lint, TypeScript checking and production build; fix failures, give me the exact PowerShell commands to launch the dev server and a short manual test checklist.
Stop before Day 2.
```

## 16. Official reference links (verified 26 Oct 2026)

- Meta Model API overview: https://dev.meta.ai/docs/overview
- Meta hosted model catalog (`GET /v1/models`): https://dev.meta.ai/docs/models
- Gemini Models API: https://ai.google.dev/api/models
- Gemini model capabilities: https://ai.google.dev/gemini-api/docs/models
- OpenRouter models endpoint: https://openrouter.ai/docs/api/api-reference/models/get-models
- Browser storage limits/persistence: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Next.js env variable security: https://nextjs.org/docs/app/guides/environment-variables
- Vercel function body limits: https://vercel.com/docs/functions/limitations
- Codex Windows installer: https://github.com/openai/codex
- Vercel Git integration: https://vercel.com/docs/git

### Deployment caveats

- Vercel Functions limit request/response payload size (documented 4.5 MB at the referenced date). Large image `Blob`s should remain client-local whenever possible; resize/compress before controlled API upload or use storage upload flows as needed.
- Model listings and availability change; only show a model as *usable for the role* when capabilities and actual account access support it.
- Local browser data is **not cloud sync** and is never a substitute for user-exported backup.
- This plan intentionally sequences **Gemini for development** followed by an explicit **Meta Muse demonstration**, since the sponsor-specific evidence matters in a Meta hackathon.

---

**Definition of V1 success:** A judge visits an English-default responsive demo, switches to Arabic if desired, sees a sample brand, creates/imports a Brand Kit, chooses an available AI provider/model, reviews three campaign concepts, generates and edits a branded creative, views an explainable Critic improvement, and exports the final result — with browser-local persistence and no account required.
