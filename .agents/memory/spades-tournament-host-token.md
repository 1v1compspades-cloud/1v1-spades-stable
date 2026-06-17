---
name: Spades tournament host token model
description: Per-player tokens issued at join; host gating for admin actions is token-only with no socketId fallback.
---

Rule: every tournament-scoped action that affects bracket state or in-game state must validate the caller via `requireTournamentHost(t, token)` (token-only) rather than comparing against `t.hostSocketId`. Per-player tokens issued at `joinTournament` are the canonical durable identity; `hostSocketId` is only a hint for routing.

**Why:** `start_tournament` historically accepted EITHER the host's current socketId OR the host token, because a host refresh in the lobby would change their sid before they could start. Admin actions (pause/resume/force-forfeit/mark-winner/remake-room) are higher-stakes than start, and accepting a socketId fallback opens an impersonation window whenever a host's old sid hasn't been recycled. The token never leaves the host's localStorage and is never included in `sanitizeTournament`, so a token-only check is genuinely safe.

**How to apply:** in any new tournament admin event handler, call `const host = requireTournamentHost(t, data.token)` and let it throw on no-token / wrong-token / token-belongs-to-a-non-host-player. Never read `t.hostSocketId` for permission. Pair every successful action with `appendAdminAudit(t, {...})` and `io.to('tournament:${code}').emit('admin_audit_appended', ...)` so the host dashboard can refresh its log.
