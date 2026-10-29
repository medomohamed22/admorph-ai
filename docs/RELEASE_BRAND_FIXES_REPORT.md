# Brand fixes: stale logo, lagging preview, dead delete (Oct 29, 2026)

Three brand-kit defects confirmed live on Oct 29, all fixed in the client
with no server change.

## 1. A brand with an unresolvable logo kept the previous brand's logo

`applyBrand` in the one-shot studio returned early when the selected
brand's logo asset could not be found, leaving both the logo preview and
the canvas logo element at the previous brand. That is exactly the
"preview lags one brand behind" seen live: the old AURA kit's logo asset
was gone, so every AURA selection kept showing the previous brand's
logo, and the delete button (see 3) could not remove the stale kit.

Fix: applying a saved brand now always defines the logo slot. When the
logo resolves, it replaces the logo element (or appends it once a product
exists, as before). When it does not resolve, the logo slot is cleared —
preview and canvas — and a note says the saved logo could not be loaded.
A brand with no logo at all clears the slot silently (nothing was lost).
Choosing "Custom brand" or uploading a logo clears the note.

## 2. Logo previews and canvas images lagged one render behind

`useObjectUrl` created the blob URL inside an effect and set it in a
deferred microtask, so every preview and canvas image showed the
previous blob for a frame — and a canvas decode could start against a
URL a later cleanup had already revoked, which never fires `onReady`
and can leave Generate disabled.

Fix: the hook now derives the URL during render (React's render-phase
state adjustment, so the committed render always carries the new URL).
A replaced URL is revoked at once; the current URL lives until replaced
or the page unloads, bounded by the blobs the app already holds.

## 3. Delete looked dead: it hid behind a native confirm dialog

The library's Delete button opened `window.confirm`. Automated browsers
dismiss native dialogs silently, so every press was a cancelled confirm
with no error and no notice — the button looked broken. Humans saw a
browser dialog; agents saw nothing happen.

Fix: deleting is now a two-step in-page confirm. The first press arms
the button ("Confirm delete"); the second press deletes. No native
dialog is involved, so the flow works the same for a person and for
automation.

## Scope notes

- The brand picker itself lists every saved kit; the "only the latest
  brand" impression from the earlier run was the stale-logo symptom
  above, not the picker. No picker change was needed.
- A genuinely lost logo asset cannot be restored from the browser;
  recreating the kit (as was done live for AURA) remains the remedy.
  The fix makes the loss visible instead of misleading.
- No paid Meta calls. Live verification with a real key was not done
  for this round; the gate below covers the behavior with fixtures.

## Gate

- ESLint: 0 errors (9 pre-existing warnings)
- TypeScript: clean
- Unit: 327/327
- Clean production build
- E2E: 60/60 (20 tests x desktop / mobile / small-phone), including 2
  new `brand-fixes` tests: a missing-logo brand clears the previous
  logo and warns, and delete asks in-page and removes the card.
