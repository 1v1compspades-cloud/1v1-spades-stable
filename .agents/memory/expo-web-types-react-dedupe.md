---
name: Expo + React-web monorepo @types/react dedupe
description: Adding an Expo artifact to a React-web pnpm monorepo silently breaks the web app's typecheck via a duplicate @types/react; fix with a workspace override.
---

Adding an Expo artifact (SDK 54 / react-native 0.81) into a pnpm monorepo that already has a React web app pulls in a SECOND `@types/react` major/minor (Expo wants ~19.1, web catalog pins ^19.2). Both copies land in `node_modules/.pnpm`. The web app's own `tsc --noEmit` then fails with `error TS2322 ... Two different types with this name exist, but they are unrelated` in otherwise-untouched files (e.g. shadcn `button-group.tsx`, `calendar.tsx`) — because TypeScript's `@types` directory walk finds both copies. Runtime is unaffected (Vite/Metro don't typecheck), so the regression only shows in `pnpm run typecheck`, not in the running app.

**Fix:** dedupe to one version via `overrides` in `pnpm-workspace.yaml`:
```
overrides:
  "@types/react": "^19.2.0"
  "@types/react-dom": "^19.2.0"
```
then `pnpm install`. Also set the Expo app's own `@types/react*` specifiers to `catalog:` so package.json matches the deduped reality. The orphaned 19.1.x folder may physically remain in `.pnpm` — that's fine; what matters is the resolution edges, which the override rewires so each package sees one copy.

**Why:** keeps the web app's previously-green typecheck green when you ADD a sibling Expo artifact, without editing any web/server source. React runtime is pinned 19.1.0 for both apps, so 19.2 types are a backward-compatible superset — low risk. Only theoretical risk is using an API typed in 19.2 but absent at runtime 19.1.

**How to apply:** any time you scaffold an Expo app alongside a React web app in this repo, run the full `pnpm run typecheck` afterward; if the web app sprouts "two different types" errors, apply the override above rather than touching web source.
