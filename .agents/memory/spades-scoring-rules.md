---
name: Spades 1v1 Competitive scoring rules
description: Authoritative scoring/bag/nil/tiebreaker rules enforced by the engine — what to assert against in tests and what NOT to change without a deliberate rule update.
---

The 1v1 Competitive ruleset baked into `calculateRoundScore` differs from generic Spades. Document the deltas here so future changes don't silently regress them.

**Bag-penalty tier is locked at PRE-round score** (not the post-round score). Per seat:
- pre-round score < 250 → every 5 bags accumulated triggers −50
- pre-round score ≥ 250 → every 10 bags accumulated triggers −100

Penalties fire on threshold *crossings* via `floor(freshBags/N) − floor(oldBags/N)`, so a single round can trigger the penalty more than once (e.g. bags 4→11 at sub-250 crosses both 5 and 10 = 2 × −50). Bags are NOT reset by the penalty — they keep accumulating.

**Why:** The threshold lock makes the round deterministic; without it a bid that pushes you past 250 mid-round would retroactively change which bag-tier the round used. The 5/10 split is the house rule for 1v1 Competitive.

**How to apply:** In tests, always compute bag penalties from `state.scores[i]` (pre-round) — never from the post-round score. When asserting final scores, remember bags carry forward even when their penalty just fired.

**Nil:** ±125 (not the standard ±100). A failed nil still accumulates bags from the tricks taken.

**Tiebreaker:** 3-round block triggered when both reach the target tied. Inside `calculateRoundScore`, `tiebreakerRound >= 3` AND still tied → resets `tiebreakerRound` to 0 and keeps `tiebreakerActive=true` (new block begins). Decisive at round 3 → `phase=game_over`. Mid-block ties (round < 3) stay in `round_over` with `tiebreakerActive=true`.
