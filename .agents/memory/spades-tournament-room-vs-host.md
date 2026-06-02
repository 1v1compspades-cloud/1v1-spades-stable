---
name: Spades tournament room-host vs tournament-host
description: Two distinct "host" concepts in Spades — perceived host-transfer bugs usually trace to the room-level Start button, not real auth transfer.
---

Two unrelated "host" concepts exist and users (and even reviewers) conflate them:

1. **Tournament host** — the person who created the bracket. Token-gated via `requireTournamentHost` for admin actions (pause, mark-winner, force-forfeit, replace-player, remake-room). Token-only, no socketId fallback. Identity NEVER moves.
2. **Room host** — playerIndex 0 of any room. Controls the "Start Match" button and the normal quick-match rematch (`new_match`). This is a per-room concept and has nothing to do with tournament/admin authority.

**Destructive room tools are admin-only, NOT room-host.** "Reset Room" (`reset_room`) is gated on the secret-key admin (`adminSockets`/`requireAdmin`) server-side BEFORE any work, and on `isAdmin` client-side — same posture as Fast Finish. The seat-0 room host is never an authority for destructive tools; hiding the button is only defense-in-depth. Do NOT re-gate Reset Room (or similar) on `isHost`/playerIndex 0. Keep `new_match` (normal rematch) seat-0-only and un-admin-gated — it's gameplay, not a destructive tool.

**Why:** When a tournament progresses, each next-round match spawns a fresh room. The first-listed player in that room is "room host" — they see a Start button no one else sees. Users perceive this as "host control transferred to the winner," which sounds like a security bug but isn't — admin powers were never on the table.

**How to apply:**
- In **tournament match rooms** (`state.tournamentRef` set), Start Match should be available to BOTH seated players, both client (Room.tsx) and server (`start_game` accepts either seated socket). This removes the perception without affecting any real authz.
- In **non-tournament rooms** keep room-host-only gating (playerIndex 0 only).
- All tournament-host admin actions must continue to call `requireTournamentHost(t, token)` — never trust socketId for those.
