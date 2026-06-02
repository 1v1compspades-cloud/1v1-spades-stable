---
name: KotT kingStreak is stale at game_over
description: Why KotT crown/King status must be derived from the match result at game_over, not from GameState.kingStreak.
---

# KotT kingStreak is stale at game_over

`GameState.kingStreak` is only bumped inside the server's `promoteNextChallenger`
(engine.ts), which runs during rotation and **requires a queued challenger**. So
at `phase === "game_over"` with no one in the queue (the common case), the streak
is NOT yet updated for the match that just ended:

- a fresh winner still reads `kingStreak === 0` ("No King yet" contradiction), and
- a dethroned King still reads `kingStreak > 0` (crown stuck on the loser).

**How to apply (client / KotT UI):** at `game_over`, derive the current King from
the match RESULT — higher score wins, or the sole remaining seat if the loser
already stepped down (one seat null), or **null on a tie** (do NOT fall back to
the stale streak on a tie). Only use raw `kingStreak` for the *live-match* King
(during play) and for the lone-seat lobby holder. Reconstruct the displayed ×N at
game_over by mirroring `promoteNextChallenger` (continuing King = prev+1, fresh
King = 1).

**Why:** the server is authoritative for gameplay but intentionally defers the
streak bump to rotation; the fix is purely a client rendering/derivation concern.
A single `tableHolderSeat` derivation should be the one source of truth for the
player-row crown, the queue panel "King: X", and every KotT status line so they
never disagree.

**Token-free links:** KotT invite/challenger links use `buildLink(false)`
(`?room=<CODE>` only) — never include reconnect/player/host/admin tokens. Keep the
challenger link visible on the game_over King-waiting and spectator-waiting
banners too, not just the pre-match lobby, or it "disappears" after a match.
