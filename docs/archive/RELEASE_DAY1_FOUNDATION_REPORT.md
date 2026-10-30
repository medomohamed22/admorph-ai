# Day 1 foundation: three fixed models, dark design system, cleanup (Oct 30, 2026)

First day of the owner-approved winning plan. Foundation only. The
one-shot flow, the remix pages and the home page keep their logic and
get the new look; their full redesigns follow on Days 2–3.

## Three fixed Meta models

- `src/lib/ai/models.ts` is the single source of truth:
  - `muse-spark-1.3-contributor`: planner, vision, critic, copy, edit
  - `muse-image-1.0`: image, image_edit
  - `sam-3.1`: segment
- `ProviderSession.taskModel(task)` now always returns the fixed model
  for that task, so every existing call site uses it without change.
  Saved role records stay readable but no longer choose models.
- Settings: the seven per-role pickers, the catalog fetch and search,
  and the save bar are replaced by three model cards. Each card shows
  the role, a description, the exact model ID and an optional Test
  button. Tests are diagnostic only and never gate a feature.
- Brand extraction no longer has its own model picker. It shows a
  Muse Spark badge instead.

## Design system v2 (`src/app/design-system.css`)

- New strings live in `src/messages/studio.{en,ar}.json`. They are merged over the base dictionaries in `src/lib/i18n.ts`, and a unit test checks that English and Arabic stay in parity.
- Dark creative-studio tokens:
  - Surfaces, text and lines.
  - Purple→pink accent gradient.
  - One colour per model (Spark purple, Image pink, SAM cyan).
  - Status colours, type scale, 4px spacing, radii and elevation.
  - Motion: 150/280/600 ms with two easing curves.
- Legacy CSS variables (`--paper`, `--ink`, `--line`) are aliased to
  the new tokens. Hard-coded light colours in `globals.css` were mapped
  to tokens. Ad-content previews (brand preview, logo placement,
  swatches) keep their real colours.
- New header:
  - Sticky glass bar with the gradient logo mark.
  - Pill navigation whose active indicator slides between items. The indicator uses a CSS curve with a slight overshoot and measures the active link (`useSlidingIndicator`).
  - Language and key-lock chips.
- Phones get a fixed five-item bottom navigation with the same sliding
  indicator. The footer is restyled.
- `prefers-reduced-motion` flattens every animation.

## UI components (`src/components/ui/`)

| Component | Notes |
| --- | --- |
| `Button` and `ButtonLink` | primary, secondary, ghost and danger variants; sm, md and lg sizes; a loading state; a shine sweep on primary |
| `Card` | interactive and glow variants |
| `ModelBadge` | |
| `StatusChip` | |
| `Segmented` | radiogroup with arrow keys (RTL-aware) and a sliding pill |
| `ChoiceCard` | |
| `ScoreRing` | animated stroke plus a counting number, for the certificate |
| Icon set and `LogoMark` | |

## Cleanup

- Removed 17 components that no route rendered after the one-shot
  simplification: studio, campaign, critic, repair, demo, creative set
  and others. Also removed the unused campaign and studio session
  providers from the root layout.
- Removed 4 unreachable library files.
- Removed 305 CSS rules whose classes no longer exist anywhere in the
  source.
- Old `/studio`, `/campaigns` and `/auto-ads` URLs still redirect to
  `/oneshot`.
- Removed the end-to-end specs that exercised the removed screens or
  the removed role pickers. Settings specs were rewritten for the three
  fixed models.

## Dependencies

- None added. All motion is CSS plus `requestAnimationFrame`.

## Not done here

- No paid or live Meta calls were made.
- The live Vercel deployment is a separate, owner-visible step.
