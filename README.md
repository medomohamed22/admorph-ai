# AdMorph AI — Hackathon baseline (Milestone 3)

Responsive English/Arabic Next.js creative playground with local Brand Kits, provider settings and portable brand export/import. **Day 3 is complete; Day 4 campaign planning has not started.**

## GitHub / Vercel handoff

Node.js **24.x**; Vercel preset **Next.js**; install `npm ci`; build `npm run build`; output directory **automatic**. No environment variables are required for this baseline.

- [Arabic upload/deployment guide](DEPLOY_GITHUB_VERCEL_AR.md)
- [Statement for judges and development window](HACKATHON.md)
- [Actual build log and planned next steps](BUILD_LOG.md)
- [Release verification and independent production smoke](RELEASE_VERIFICATION.md)
- The live site includes `/hackathon`, linked in the footer.

The first recorded working baseline was prepared on **26 October 2026**. Continued development is planned through **4 November 2026**. Future changes will be recorded as real commits and verification runs. Milestone labels “Day 1–3” describe feature iterations completed on 26 October, rather than three elapsed calendar days. Authenticated Meta generation remains planned.

## Run on Windows PowerShell

```powershell
cd 'admorph-ai' # or the extracted upload folder containing package.json
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://localhost:3000. Skip `npm ci` when dependencies are already installed. The handoff leaves the local development server running. Stop it with Ctrl+C.

## Try Day 3

1. Open **Create your Brand**. Enter a name, short description and three HEX colors; optionally upload a PNG/JPEG/WebP logo. The workspace and preview follow the palette while text/button contrast stays readable.
2. **Save Brand Kit**, then reload `/brands`: the brand, logo and active theme remain. The library supports editing, choosing the active brand, restoring the default theme and deleting a kit after confirmation.
3. **Export Brand Kit** downloads a versioned `brand-kit.json` with the brand fields and optional embedded logo. **Import Brand Kit** always creates a new ID, so importing the same file never overwrites existing work. API keys, passphrases, provider settings and internal asset IDs are excluded.
4. In Settings choose **العربية**, or use the header language button. All current app screens, forms, notifications and errors switch to Arabic with RTL. English is the first-visit default regardless of device locale. The saved language survives refresh. Language changes do not reset form values or demo edits. New-brand drafts also survive internal navigation within this tab; save is required to keep a brand after reload.
5. Fetch models, assign roles and **Save Settings**. Non-secret provider settings, custom HTTPS base URL and model roles survive refresh. Catalog metadata is cached with its original timestamp and restored as **not freshly verified**. Typing a new key does not discard saved model selections. Unknown or no-longer-compatible saved role assignments are checked against cached capabilities.
6. Keys stay in memory by default. For optional at-rest storage, expand **Optional encrypted key storage**, enter a passphrase of at least 12 characters, and explicitly choose **Remember key on this device**. After refresh the key stays locked until the passphrase is entered again. **Clear key** also removes the encrypted copy. Unlocking never grants permission to send a key; request consent is separate.
7. Storage controls show an approximate browser quota/usage estimate and make a best-effort persistent-storage request. The browser may deny it. Export/import lives in the brand library; full workspace ZIP backup remains a later enhancement.

## Storage and security

Dexie manages IndexedDB database `admorph-local-v1`:

- `settings`: language, active brand ID and explicitly saved non-secret provider settings/roles.
- `brands`: editable name, description, three colors and asset references.
- `assets`: logo `Blob`s stored separately from brand metadata.
- `modelCatalogCache`: provider, normalized model metadata and original fetch time; no credential-validity proof is persisted.
- `encryptedCredentials`: only opt-in AES-GCM ciphertext, randomized salt/IV, version, PBKDF2 iteration count and provider/endpoint binding. No plaintext key or passphrase.

Brand and logo writes/deletes use transactions. Logo object URLs are revoked when previews are replaced or unmounted. Allowed logos are PNG/JPEG/WebP up to 2 MB and 4096 × 4096 pixels; SVG is rejected. Imported JSON is limited to 3 MB and validated against a strict versioned Zod schema. Import allocates new IDs. There is no archive decompression or generic download proxy.

Credentials use PBKDF2-SHA-256 (310,000 iterations) and AES-256-GCM with provider identity and Custom endpoint authenticated as associated data. A Custom saved key cannot be unlocked for a different endpoint. The passphrase field is cleared after each action. At-rest encryption does **not** protect against active XSS, extensions or malware; official BYOK requests still temporarily transit the app’s server, as disclosed in the UI. Full brand exports contain neither encrypted credentials nor secrets.

If IndexedDB is denied, opening it stalls, quota is exhausted or a write fails, the app warns the user and keeps current brand values in memory for export. It does not silently delete existing work or report an unsuccessful write as a local save. Clearing cached catalogs leaves Brand Kits and saved roles intact.

Local data belongs to the same browser/profile/device/origin. It is not cloud sync. `localhost` and `127.0.0.1` are different origins, so consistently use **http://localhost:3000**. Moving to another device or a future production domain requires brand export/import. Browser cleanup/private browsing can remove local data even when persistence was requested.

## Provider behavior retained from Day 2

- Gemini: fixed official host, API-key header, bounded pagination and retries. `generateContent` without output modalities is labelled a **provisional text candidate**. Image/vision support is never guessed from a name.
- Meta: fixed official host and Bearer-authenticated model catalog; omitted capabilities stay unknown.
- OpenRouter: public catalog can be fetched without a key. Its `/key` endpoint is used for actual credential tests. Modality metadata controls role eligibility.
- Custom: HTTPS browser-direct calls with explicit endpoint consent, no credentials in the URL and no redirects. CORS is required. The server rejects arbitrary upstream forwarding. Public catalog reachability is not shown as key validity.
- Search, capability/availability filters, quick text roles, mixed-provider roles, manual unverified text IDs, cancellation and actionable safe errors remain available. Image maker cannot use a text-only or unverified manual model.

No paid generation API has been implemented or called. No owner-managed server keys are used.

## Verification commands

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome through Playwright at 1440px desktop, 390px touch emulation and 320px. Default tests use synthetic provider fixtures and isolated browser profiles; they never use real user keys or paid generation. Unit persistence tests use `fake-indexeddb`, and browser tests verify real browser IndexedDB, reloads, downloads and decrypted values.

Optional live public catalog regression, with the server running:

```powershell
npm run test:catalog:live
```

This reads the public OpenRouter catalog with no key, saves text-role selections and verifies their reload plus the cached-catalog label. It never generates content. The report and screenshot are written under `test-results`; run it after `test:e2e` if retaining those artifacts, because Playwright resets that directory at suite startup.

Next.js native compilation/Chrome needed approved execution outside this managed Windows sandbox. Normal Windows PowerShell does not have that sandbox restriction. Run type generation and builds sequentially because they write `.next`.

## Milestone boundary

See `DAY3_VALIDATION.md` for current results and local screenshots. The homepage still provides the three-concept interactive sample, editable headline/colors, deterministic contrast fix/undo and reset. `/campaigns/new` and the full studio remain labelled later-milestone shells. `/api/health` returns milestone 3 and `liveGeneration: false`.

No Day 4 campaign planner, paid brand suggestions, image generation, full Konva editor, cloud synchronization, GitHub push or deployment was implemented. Phone QA uses Chrome emulation; physical iPhone Safari/Android testing has not been performed. Authenticated Gemini/Meta/provider account access remains unverified because no real credentials were supplied.

## Implementation references and licenses

- [Dexie React usage](https://dexie.org/docs/Tutorial/React) and [transactions](https://dexie.org/docs/Dexie/Dexie.transaction())
- [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey)
- [Browser persistent storage](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- [Gemini catalogs](https://ai.google.dev/api/models), [Meta catalogs](https://dev.meta.ai/docs/models), [OpenRouter metadata](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties) and [key validation](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key)

Inter and Cairo are bundled locally from the official Google Fonts repository. Their SIL Open Font License files are included in `public/fonts`. No external font service is required at runtime. Next.js behavior was checked against installed 16.4.3 documentation under `node_modules/next/dist/docs/`.
