# Redesign Phases 3–4: modern pickers + button hierarchy (Oct 30, 2026)

Phases 3 and 4 of the owner-approved redesign plan, shipped together.
No flows, models, or generation logic changed — only how choices
and destructive actions look.

## What changed

- Settings role picker: the duplicated select + free-text input per
  role is gone. Each role now has one select (catalog models plus a
  "Custom model ID" option); the text input appears only when a
  custom ID is in use or chosen, so a manual ID is still fully
  supported without a second always-visible control.
- One-shot brand picker: the native select is now a card grid —
  one card per brand with its name and color swatches, plus a custom
  card — with a selected ring. Duplicate brand names are no longer
  bare identical dropdown rows.
- Themes picker: the four native checkboxes are now cards with a
  per-theme color strip (Ramadan, Eid, Black Friday, Summer) and a
  selected ring; the 3-theme limit and busy locking are unchanged.
- Variants count: the 2/3 select is now a segmented two-button
  control.
- Delete, unified: brand-library and remix-gallery deletes were
  small red underlined text buttons; both are now real secondary
  buttons in a danger style, keeping the existing two-step in-page
  confirm.
- Active brand: the active brand card now also carries a ring, not
  just a badge and a disabled button.

## Tests

- E2E updated to the new controls: brand cards are clicked by
  name (oneshot + brand-fixes specs), the themes test clicks the
  Eid card, and the brand-switch assertion checks aria-pressed.
- No paid calls.

## Gate

- ESLint: 0 errors (pre-existing warnings only)
- TypeScript: clean
- Unit: 332/332
- Clean production build
- E2E: one-shot + brand-fixes + wordmark-logo + ad-remix +
  responsive specs on 3 viewports.
