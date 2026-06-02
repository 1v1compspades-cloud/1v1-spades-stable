---
name: Live tournaments are memory-only — never redeploy mid-event
description: Operational rule for event-day — restarting/redeploying the API server destroys any in-progress tournament.
---

# Live tournaments evaporate on server restart

On boot the API server rehydrates **rooms** (`rehydrateRoomsOnBoot`, from `active_rooms`) but does NOT rehydrate **Tournament** structs — `tournaments.set(code, t)` only runs at create time. Bracket *results* persist in the `tournament_matches` DB table, but the live roster, per-player reconnect tokens, pending match assignments, and lobby state are purely in-memory.

**Why it matters:** During a live event, ANY API-server restart or redeploy wipes the in-progress tournament (roster + every player's reconnect token + assignments). A code "fix" pushed mid-event destroys the very tournament it was meant to rescue.

**How to apply:**
- Do NOT redeploy or restart the production API server while an event/tournament is live. Recover operationally instead, then ship code changes between events.
- A player's reconnect token lives in only two places: the server's memory and that player's *original browser* localStorage (`spades_tournament_token_<CODE>`). The safe recovery for a disconnected player is to reopen the tournament link in the SAME browser they joined from.
- There is currently NO admin event to re-mint or reveal a player's reconnect token mid-tournament. `host_replace_player` issues a fresh token but is **lobby-only** (rejects once `t.status !== "lobby"`). A new device / cleared cache mid-tournament = no live recovery path without a redeploy (which is itself destructive). This is a real gap worth a feature (admin "re-issue reconnect link") if requested — built and deployed between events, never during one.
