---
name: Spades tournaments are admin-only (ADMIN_HOST_KEY)
description: The admin-key model that SUPERSEDED per-tournament host tokens for all tournament management + Host Tools.
---

# Tournaments are admin-only, gated by a secret env key

All tournament management (create / start / invite / replace-player / every `admin_*` event + the legacy `tournament_force_forfeit` alias) and the Host Tools dashboard are gated by a single secret env key `ADMIN_HOST_KEY`, validated server-side on the socket via `requireAdmin(socket)`. Normal players only get Quick Match / King of the Table.

**Why:** Event-day requirement — only the operator (Mehdi) may run brackets. The previous per-tournament *host token* model gave host powers to whoever held a localStorage token, which is forgeable/copyable and not tied to a real operator identity.

**How to apply / invariants:**
- Admin proves the key ONCE via `admin_unlock {key}` (constant-time compare, fail-closed when the key is unset). Server returns an **opaque resume token** stored ONLY in the admin browser's `sessionStorage` under `spades_admin_session`. The key itself is NEVER stored, never resent, never in any link or socket payload. Resume via `admin_resume {sessionToken}` on every (re)connect.
- `ADMIN_HOST_KEY` and the session token must never enter `sanitizeTournament`, invite links, spectator links, or broadcasts.
- Client gates UI on `isAdmin` + `adminChecked` from `useSocket` — NEVER on any localStorage artifact. On socket `disconnect`, reset BOTH `isAdmin=false` and `adminChecked=false` so no admin UI renders during the reconnect/resume race; the connect handler re-resumes and only then re-grants.
- Admin is NOT auto-added as a player: `createTournament(opts.seedHost:false)` → empty `hostName`/`players`. `startTournament`'s internal host-socket/token auth is skipped only when `hostName === ""` (the admin path); the socket-level `requireAdmin` is the real gate.
- The per-seat **player reconnect token** (`spades_tournament_token_<CODE>` via `getTournamentToken`) is unrelated and STILL used — it only reclaims a player's roster seat, grants no admin power.
- The old `spades_tournament_host_token_*` localStorage path is fully removed (no read/write/export). Its prefix is kept ONLY in the useGameStorage cleanup sweep to purge stale legacy keys.
- `hostControls.ts` / `computeStartControl` + its test remain exported but UNUSED by design (Tournament.tsx no longer calls them).
