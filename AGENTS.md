<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## AdMorph working agreement
- Read ADMORPH_BUILD_PLAN.md before changes; implement one authorized milestone at a time.
- Current scope: Day 3 IndexedDB storage, English/Arabic switching, Brand Kit creation/theme/export/import and optional encrypted credential storage. Stop before Day 4 campaign planning.
- Release preparation is authorized: create a source-only GitHub/Vercel folder and dated hackathon evidence. The user will upload/deploy manually. Do not publish or start Day 4 features in this task.
- Never call paid APIs without explicit approval or a visible user-triggered action.
- Never store/log plaintext keys; no secrets in commits, fixtures, exports, or NEXT_PUBLIC_ variables.
- English is default. Keep full English/Arabic translations in parity for all app screens and messages.
- Support keyboard, mobile, desktop, visible focus and touch-friendly controls.
- Use IndexedDB for large browser assets; no localStorage blobs.
- Keep provider adapters separate and capability-aware. Validate model JSON with Zod and clamp safe fixes.
- Include loading/error/empty states; no fake API success or unlabelled dead buttons.
- Run lint, typecheck, available unit/browser tests, and build; report exact outcomes.
- Avoid unrelated rewrites and backend databases. Keep changes reversible.
