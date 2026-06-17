---
name: Spades engine tests run with tsx
description: The `.test.mts` files in artifacts/api-server/src/game/__tests__/ require npx tsx, not node --experimental-strip-types.
---

Rule: run the Spades engine tests with `cd artifacts/api-server && npx -y tsx@latest src/game/__tests__/<file>.test.mts`. Do not use `node --experimental-strip-types`.

**Why:** test files import internal modules via ESM-style `.js` specifiers (e.g. `from "../tournament.js"`), but the source is `.ts`. `tsx` rewrites those specifiers and runs the TS file directly. Node's `--experimental-strip-types` only strips type annotations — it does NOT remap `.js`→`.ts`, so it throws `ERR_MODULE_NOT_FOUND` on every import. PHASE5_REPORT.md documents the same invocation.

**How to apply:** mirror existing tests (`rules.test.mts`, `tournament-tx.test.mts`, `admin.test.mts`) — same import style, same runner. Tournament tests touch the dev DB (`recordMatchResultTx` writes to `tournament_matches` + `game_audit_log`), so use unique tournament codes per test to stay isolated. End every async test main with `await flushTournamentLocks().catch(() => {})` before `process.exit` so the pg pool drains cleanly.
