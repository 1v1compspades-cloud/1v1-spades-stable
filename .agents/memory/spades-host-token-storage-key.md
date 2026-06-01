---
name: Spades host token client storage key
description: Why the tournament host token must live under its own localStorage key, separate from per-player tokens, and how host UI must be gated.
---

# Host token vs player token: distinct localStorage keys

The tournament **host** secret and every joined **player's** per-player reconnect
token must NOT share one localStorage key. Host token lives under
`spades_tournament_host_token_<CODE>`; player tokens under
`spades_tournament_token_<CODE>`.

**Why:** When both were stored under the same `spades_tournament_token_<CODE>`
key, any host-detection that keyed off mere *presence* of that key
(`hasHostToken`, HostDashboard access gate, Room reconnect host shortcut) turned
every joined player into a "host" in the UI — they could open Host Tools. The
server was never fooled (`requireTournamentHost` checks the exact host token, and
`joinTournament` always mints a fresh `makeToken()`), so it was a client-only UI
leak, but it's exactly what a non-technical operator perceives as "host
permissions went to a random player."

**How to apply:**
- Only the tournament-CREATE path (Lobby) writes the host key. No join,
  backup-join (`?join_token`), or reconnect path may ever write it — that keeps
  the host token from being copied to a player.
- Host token === host's own `players[0].token` (set in `createTournament`), so
  `subscribe_tournament` can send `getHostToken || getTournamentToken` and the
  host still reconnects to their seat.
- Gate ALL host-control UI on the host key (`getHostToken`), not on `iAmHost`
  (a name compare — a same-named player could collide).
- HostDashboard does server-authoritative validation by reusing
  `admin_dashboard`'s host-rejection: on rejection, clear the stale host key and
  bounce. No dedicated `validate_host_token` event is needed.

**Gotcha:** tokens are stored TTL-wrapped as JSON `{ token, savedAt }`. Any code
reading a token straight from `localStorage.getItem` must unwrap it before
sending to the server, or the host locks themselves out (HostDashboard had this
latent bug — it read the raw JSON string and sent it as the token).
