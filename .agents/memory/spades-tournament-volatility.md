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
- Mid-tournament recovery for a player on a new device / cleared cache: admin uses the **"Reconnect link"** button in the Host dashboard (`admin_reissue_token` → `reissuePlayerToken`). It rotates only the player's token (preserving roster slot + pendingAssignment) and returns a one-time `?join_name=&join_token=` link the admin hands the player; opening it re-routes them into their CURRENT match. `host_replace_player` remains **lobby-only** (swaps in a different person); reissue is the any-status same-person rescue. Fresh token is returned to the admin via callback only — never broadcast / sanitized.
