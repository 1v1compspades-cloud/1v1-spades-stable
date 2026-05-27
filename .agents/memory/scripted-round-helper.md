---
name: Scripted-round helper gotchas (Spades rules tests)
description: How to construct a deterministic full-round scenario for engine tests, and the two ways the helper diverges from a naive `tricks0` request.
---

The Spades rules test suite uses a `forceRoundOutcome({bid0, bid1, tricks0, firstBidder, roundNumber, ...})` helper that hand-builds player hands and then auto-plays the round via the engine's own play loop. Two non-obvious behaviors:

1. **`tricks0` is a hint, not a guarantee.** The auto-play picks the lowest legal card by `cardValue`. JS `Array.prototype.sort` is stable (ES2019+), so when two cards share a rank (e.g. `2S` and `2H`), the original construction order decides which leads. For some layouts this routes a spade lead earlier than intended and the actual `(t0, t1)` split shifts by ±1 from the requested value. Don't fight this — record the actual split the helper produces and assert against it. The engine is correct; the helper is a convenient scenario generator, not a precise oracle.

2. **`firstBidder` is overridden by `getFirstBidderForRound` for non-odd rounds.** The engine recomputes the first bidder from `firstBidderRound1` on every round: odd → same seat, even → opposite. So calling the helper with `firstBidder: 1, roundNumber: 4` actually has seat 0 leading the first trick. If the hand layout was built assuming seat 1 leads, the play sequence diverges. For tiebreaker scenarios prefer odd round numbers (3, 5) so the layout matches.

**How to force a tied post-round result** (needed for the persistent-tie tiebreaker branch): use both-bid-0 nil with equal pre-scores. Both sides fail nil → both −125 → tied. Pick pre-scores ≥ 250 so the 250+ bag tier applies (avoids the asymmetric sub-250 5-bag penalty triggering on one side).

**How to apply:** When the helper output disagrees with your expected `(t0, t1)`, trust the helper (it routes through the real engine) and recompute the expected score from the actual split. Re-run with `DEBUG_HELPER=1` to print `tricks/bags/scores` per scenario.
