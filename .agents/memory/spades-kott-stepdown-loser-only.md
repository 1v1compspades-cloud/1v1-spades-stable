---
name: KotT step-down must be loser-only
description: Why any KotT seat-vacating action at game_over has to be authorized to the losing seat only.
---

# KotT step-down / seat-vacate must be loser-only

Any KotT action that lets a *seated* player vacate their seat at `phase=game_over`
(e.g. the loser's "Rejoin Queue" / "Back to Lobby" step-down) MUST be
authorized to the **losing seat only**, server-side.

**Why:** `promoteNextChallenger`'s null-seat branch crowns whoever remains seated
and bumps their `kingStreak`. So if the WINNER is allowed to vacate, the rotation
crowns the *loser* and awards them a streak — a silent integrity break. A
client-side `iLost` gate is not enough; a custom client can emit the event
directly.

**How to apply:** gate these events with a pure helper (`canKottStepDown` in
`engine.ts`) that requires `mode=king`, `phase=game_over`, caller seated, BOTH
seats present, non-tied score, and `callerSeat === lower-score (loser) seat`.
Non-seated callers and the winner are rejected. Keep `phase=game_over` (NOT
`waiting`) after stepping down so the queue→`promoteNextChallenger` null-seat
branch still works (`joinRoom` rejects unless `phase=waiting`).
