# Day 3 execution and validation

Scope: Dexie/IndexedDB storage, English/Arabic switching with RTL, Brand Kit creation/theme/export/import, and optional encrypted credentials. Stop before Day 4 campaign planning.

## Delivery checklist

- [x] Read the build plan and existing working agreement; update scope to Day 3 only.
- [x] Add Dexie and strict versioned schemas for settings, brands, separate Blob assets, catalog cache and encrypted credentials.
- [x] Transactional brand/logo writes, replacement and deletion. Brand library supports create/edit/activate/default theme/delete.
- [x] Three editable HEX colors and live workspace/preview theme; foreground and control-outline safety for very bright/dark palettes.
- [x] Version 1 JSON export with exact embedded logo bytes; import validates schema/type/size/dimensions and assigns new conflict-safe IDs. Exports exclude provider settings and all credentials.
- [x] Persistent selected language, active brand, saved non-secret provider settings/roles and timestamped catalog metadata.
- [x] Cached catalogs restore without a credential-success claim; known incompatible saved roles are cleared while explicitly acknowledged manual text selections can remain unverified.
- [x] Complete English and Arabic dictionaries for current screens, notifications, errors and controls. English is default even for Arabic device locale.
- [x] Language selector and header toggle apply RTL without resetting form/demo edits. New-brand drafts also survive internal navigation within the tab.
- [x] Inter and Cairo bundled locally with their OFL licenses. No runtime external font dependency.
- [x] Memory-only keys by default; optional PBKDF2-SHA-256 / AES-256-GCM encrypted copies with randomized salt/IV and provider/Custom-endpoint binding. Passphrase is not stored.
- [x] Reload requires manual unlock; wrong passphrases fail; unlocking does not grant request consent. Clear key removes encrypted copy.
- [x] Storage estimates labelled approximate, best-effort persistent-storage request and honest denial handling.
- [x] Storage denial/open timeout/quota write failure retain an exportable session with warnings. No false local-save success or silent deletion.
- [x] Preserve prior provider/demo behavior and update health to milestone 3. No Day 4 generation/planner work.

## Checks

- `npm run lint`: passed without warnings.
- `npm run typecheck`: passed.
- `npm test`: **59 passed** across three files. Includes prior provider/rule coverage plus real Dexie APIs using fake-indexeddb, brand/blob round trips, logo replacement/deletion, strict portable format validation, image limits, encrypted key round trips, wrong passphrases/tampering/provider-endpoint binding, saved-role normalization and readable theme colors.
- `npm run test:e2e`: **63 passed** at 1440px desktop, 390px touch-phone emulation and 320px small phone. Covers all prior flows plus real browser IndexedDB reloads, role/catalog retention, absence of plaintext key persistence, encrypted unlock/clear, exact logo/palette JSON round trip, conflict-safe import, edit/delete, Arabic/RTL on all routes, language/draft retention, invalid inputs and storage-denial/quota/persistence-denial paths.
- `npm run build`: passed with all routes.
- Optional `npm run test:catalog:live`: public no-key OpenRouter catalog UI check, including local role/cache reload persistence. See `test-results/live-catalog.json` for the exact timestamp and model count.
- Visual QA: English brand form and Arabic brand/Settings captures reviewed; translated upload button opens the real file chooser and the native input is hidden, eliminating English file-input text. The development server was restarted to verify final CSS rather than stale hot-reload output. Responsive overflow assertions pass at all three sizes.

The quota test injects an IndexedDB object-store write failure. Dexie binds the native transaction method at open time, so changing that method afterwards did not simulate quota; the fixture was corrected to intercept `IDBObjectStore.put` for the brands store. Production behavior correctly kept the draft exportable when the write actually failed.

## Evidence

Generated and ignored by Git:

- `test-results/desktop-day3-brand-form.png`, `mobile-day3-brand-form.png`, `small-phone-day3-brand-form.png`
- `test-results/desktop-day3-ar-brand.png`, `mobile-day3-ar-brand.png`, `small-phone-day3-ar-brand.png`
- `test-results/desktop-day3-ar-settings.png`, `mobile-day3-ar-settings.png`, `small-phone-day3-ar-settings.png`
- `test-results/live-openrouter-settings.png` and `test-results/live-catalog.json`

Default browser tests use temporary profiles and synthetic provider/key fixtures. They do not modify the user's ordinary Chrome profile or contact paid AI providers. The live script reads a public model list with no key and performs no generation. Playwright clears its result directory on each suite startup; run the live script afterwards to retain that evidence.

## Verification limits

- Authenticated Gemini, Meta and OpenRouter calls were not verified with real credentials because none were supplied. Existing adapter/handler tests use synthetic fixtures; public OpenRouter listing is the separate live check.
- Custom compatibility still depends on the endpoint's HTTPS, CORS, catalog schema and permissions. Browser tests use a simulated Custom endpoint.
- Storage failure/quota cases are simulated deterministically. Real browser reloads, IndexedDB Blob retention, downloads and encryption run in Chrome. Persistent-storage denial is tested; the app does not promise browsers will grant persistence or prevent users deleting local data.
- Phone checks are Chrome emulation, not physical iPhone Safari or Android testing.
- Browser-local data is scoped to profile/device/origin, not cloud sync. Use `http://localhost:3000` consistently and export/import to migrate.
- Full workspace ZIP backup, AI brand suggestions, campaigns/planning, generated images, full layer editor, deployment and GitHub publication remain later work. No paid generation ran.

Historical Day 1/2 results remain in their respective validation files. README.md describes the current Day 3 setup and manual checks.
