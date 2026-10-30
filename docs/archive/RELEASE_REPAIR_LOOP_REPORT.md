# Release report — Closed-loop repair on the mockup (Oct 29, 2026)

The mockup check used to only report problems. Now it closes the loop:
inspect -> propose -> user approves -> apply -> re-inspect -> before/after,
with every step deterministic and reversible.

## How the loop works

1. **Inspect** (unchanged): `inspectOneshotLayout` measures five things on
   every arrangement — element over product, texts over each other, logo
   over text, text contrast below 4.5 on the mockup sheet, text within
   60px of a frame edge. Geometry and pixel math only, no model call.
2. **Propose** (new, `src/lib/oneshot/repair.ts`): one deterministic
   proposal per finding, computed from the same rule set:
   - Overlap with the product: move the non-product item to the first
     position that clears every element — below, above, right, then left
     of the blocker, then steps down/right — clamped to the canvas. Texts
     must also land inside the safe zone, or the fix would trade one
     finding for another.
   - Two texts overlapping: move the second one.
   - Logo over text: move the text, never the logo (logos are brand
     anchors) and never the product.
   - Low contrast: recolor to the highest-contrast brand color that
     passes 4.5 (identity-preserving); black/white only if no brand color
     qualifies.
   - Outside the safe zone: pull the element inside the 60px margin.
   - A finding with no fitting position simply gets no proposal — the
     panel says so plainly instead of guessing.
3. **Approve**: each finding carries its own "Apply fix" button. Nothing
   applies without a press, and nothing applies in bulk.
4. **Apply**: an applied fix is an ordinary canvas edit, so it lands in
   the existing 50-step undo history — Undo reverses it, and the applied
   fixes list under the panel records what changed
   (e.g. `text "Hello" moved to (140, 996)`).
5. **Verify**: the inspect list recomputes from the new arrangement
   automatically. That re-run IS the verify step: a fix that clears its
   finding makes the list shorter, and a fix that creates a new problem
   shows up as a new finding to fix next.

## What the loop deliberately does NOT do

- No model is consulted anywhere in it: no coordinates, no colors, no
  explanations from a model. Every proposal is geometry or contrast math
  over the live arrangement, so the demo moment cannot fail on a model
  reply.
- The product pixels are never moved for a finding, and the certificate
  is still invalidated by any post-verification edit, as before.

## Verification

- Lint 0 errors, `tsc --noEmit` clean.
- Unit suite 318/318 (39 files), including 7 new repair tests: move off
  the product, move the second text, move the text under a logo, recolor
  to a passing brand color, pull inside the safe zone, no proposal when
  nothing fits, nothing for a clean layout.
- Clean production build.
- One-shot E2E 45/45 (15 tests x desktop / mobile / small-phone) on the
  local production build, including the new loop test: add an overlapping
  line, apply the fix, the inspect comes back clean with the applied fix
  recorded, Undo brings the finding back.
- Production smoke after merge: `/api/health` 200, `/oneshot` 200.
- No paid calls by the implementation. Live verification with a real key
  was not done for this round.
