---
name: KotT single-player lobby holds server-side
description: "Lobby doesn't hold with one player" KotT reports are frontend UX, not server bugs.
---

# KotT single-player lobby

When a "King of the Table (KotT) lobby doesn't hold with only one player" bug is reported, the server is almost certainly already correct. Verified via socket reproduction: a single-player KotT room persists (`phase=waiting`, `players=[King,null]`), invite/challenger join works, and `set_ready` (both seats) + `start_game` flows to a live match.

**Why:** The engine nulls a vacated seat but keeps the room in memory (only the idle-stale sweep removes it). The real gap is presentational — the lone player's waiting screen rendered the generic 1v1 "Waiting for opponent…" view and the queue panel showed "No reigning King yet" because the King was computed only from `kingStreak > 0` (a fresh room is `[0,0]`).

**How to apply:** Treat the lone seated KotT player as the table-holder / King-in-waiting (`tableHolderSeat = reigningKingSeat ?? loneSeat`). Reproduce server behavior with a socket client before editing server code. The KotT ready event is `set_ready {roomCode, ready}` (NOT `toggle_ready`); `start_game` requires `players[1]` set, `phase==="waiting"`, and `ready[0] && ready[1]`.
