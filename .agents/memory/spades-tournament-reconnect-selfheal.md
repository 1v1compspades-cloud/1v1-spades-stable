---
name: Spades tournament reconnect self-heal & disconnect grace
description: Why tournament reconnect must trust pendingAssignment over a cached room code, and the disconnect auto-forfeit policy.
---

# Tournament reconnect self-heal

A live 16-player event was lost because disconnected players could not get back in. Production logs showed repeated `reconnectPlayer` → "Room not found" for multiple players, while a silent disconnect auto-forfeit eliminated them.

**Root cause:** the client reconnected using a per-round room code cached in localStorage (`spades_room_tournament_<roomCode>` maps roomCode→tournamentCode, and the seat/room are cached separately). After a round ends the old room is cleaned up, so reconnecting to that stale code throws "Room not found." The old client then did `setLocation("/")` (dumped to public lobby) AND destructively cleared the player token.

**Rule:** a cached per-round room code is NOT authoritative for "where should this player be now." The tournament's `pendingAssignment` (re-emitted as `match_assigned` on an authenticated `subscribe_tournament`) is the source of truth. On a stale-room reconnect failure, route the player through `/tournament/<code>` so the tournament page re-subscribes and the server re-routes them into their CURRENT live match. `pendingAssignment` persists for the whole live match (only cleared on match resolution), so this works mid-match.

**Why:** trusting the cached room code creates a dead-end the player can't recover from; routing through the tournament re-subscribe is the only path that self-corrects after a round boundary.

**Token-clearing rule:** only clear the player reconnect token on a genuine seat/token rejection (server msgs contain "seat"/"token"). NEVER clear it on a stale-room ("Room not found") or retryable infra error ("Reconnect temporarily unavailable, please retry") — the token is still valid for the live room and clearing it makes the next attempt fail harder.

# Disconnect auto-forfeit policy

`TOURNAMENT_AUTO_FORFEIT_MS` = 5 min (was 2 min — too harsh for venue wifi). On disconnect, `scheduleAutoForfeit` immediately emits `tournament_player_disconnected` to the `tournament:<code>` room so the host gets a toast and can intervene. When the grace timer fires: if the match `isPaused`, it DEFERS (re-arms with `notify=false`) instead of forfeiting — so a host can pause to hold a disconnected player's slot indefinitely, then resume or forfeit manually. Otherwise it forfeits so the bracket keeps moving.

**How to apply:** if re-tuning, the policy lever is "pause = hold slot." Don't make auto-forfeit require host confirmation by default (bracket would stall if the host is also absent); pause is the opt-in hold.
