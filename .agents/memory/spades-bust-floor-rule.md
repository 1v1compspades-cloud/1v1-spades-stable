---
name: Spades bust-out floor (-250) game-over rule
description: How the post-hand -250 immediate-loss rule resolves the loser and why it must never emit a tied game_over.
---

# Bust-out floor (-250) loss rule

After a hand is fully scored (round deltas + bag penalties folded into
`finalScores`), if a seat's running total reaches `LOSS_FLOOR` (-250) or lower
it immediately loses via the normal game-over flow. Evaluated ONLY in the
round-complete path in `engine.ts` (never mid-hand).

## Loser selection MUST follow score, not check order
The loser is the **lower-scoring** seat (`finalScores[0] < finalScores[1] ? 0 : 1`),
NOT the first seat found below the floor.

**Why:** downstream winner derivation in `advanceTournamentOnGameOver`
(socket.ts) and KotT rotation both pick the **higher score** as winner
(`s0 > s1 ? "A" : "B"`). If the engine names a different loser than the seat
those flows eliminate, the UI ("X loses by reaching -250") contradicts the
bracket outcome. Single-bust case is automatically consistent: the busted seat
trails the >floor seat.

## Both-bust EXACT tie must NOT produce a tied game_over
If both seats bust to the *same* exact score, the engine deliberately does NOT
force game_over — it falls through to normal end-of-round handling and the match
continues.

**Why:** `advanceTournamentOnGameOver` early-returns when `s0 === s1`
("engine prevents true ties at game_over"). A tied game_over would silently
stall a tournament bracket. Both players failing the same bid from the same
pre-score can reach identical totals (e.g. both bid 8, take 6/7 → both -80), so
this is reachable, not theoretical.

**How to apply:** any future change to the floor/game-over logic must keep the
no-tied-game_over invariant intact, or the advancement code needs a paired
change to its tie handling.
