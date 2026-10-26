<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AdMorph working agreement
- Read ADMORPH_BUILD_PLAN.md before changes; implement one authorized milestone at a time.
- Current scope: campaign form, product image, Gemini planning and editable approval of three concepts; preserve existing storage and bilingual UI. Stop before background/image generation and the full editor.
- Prepare a manual GitHub update packet against releases/AdMorph-GitHub-Vercel. Use feature-based commit/PR wording with no numbered-day references. The user uploads/deploys manually; do not publish remotely.
- Never call paid APIs without explicit approval or a visible user-triggered action.
- Never store/log plaintext keys; no secrets in commits, fixtures, exports, or NEXT_PUBLIC_ variables.
- English is default. Keep full English/Arabic translations in parity for all app screens and messages.
- Support keyboard, mobile, desktop, visible focus and touch-friendly controls.
- Use IndexedDB for large browser assets; no localStorage blobs.
- Keep provider adapters separate and capability-aware. Validate model JSON with Zod and clamp safe fixes.
- Include loading/error/empty states; no fake API success or unlabelled dead buttons.
- Run lint, typecheck, available unit/browser tests, and build; report exact outcomes.
- Avoid unrelated rewrites and backend databases. Keep changes reversible.
