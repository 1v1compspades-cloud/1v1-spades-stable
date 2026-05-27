# Phase 5 — 1v1 Competitive Spades Rules Validation

Deterministic test suite in `rules.test.mts` covering the engine's enforcement of
the 1v1 Competitive ruleset. Run with:

```
cd artifacts/api-server && npx -y tsx@latest src/game/__tests__/rules.test.mts
# or with diagnostics:
DEBUG_HELPER=1 npx -y tsx@latest src/game/__tests__/rules.test.mts
```

**Current status: 84 PASS / 0 FAIL.** Full workspace `pnpm run typecheck` is green.

---

## Rules confirmed by tests

| # | Rule | Where asserted |
|---|---|---|
| 1 | Coin toss winner bids SECOND in round 1; alternation thereafter (odd → `firstBidderRound1`, even → opposite) | Test 1 — `getFirstBidderForRound` + dealer order |
| 2 | Bidding is sequential, second bidder is locked at `state.bids[other]` after first bid | Test 1 + Test 8 |
| 3 | Cannot lead a spade while spades are not broken and you hold a non-spade | Test 2 (legality) + spade-break edge inside Test 4 |
| 4 | Must follow suit when holding the led suit (renege rejected) | Test 2 + Test 6 |
| 5 | Trick winner = highest spade if any spade played, else highest card of led suit | Test 3 (trick/book logic, 4 scripted micro-tricks) |
| 6 | Standard book scoring: bid made → +10·bid, +1 per overtrick (overtricks become bags) | Hands 1, 2, 3, 4 in Test 4 |
| 7 | Failed bid → −10·bid, no bag accumulation for the failer | Hand 2 (failed bid) |
| 8 | Successful nil → +125 (house rule), 0 bags | Hand 3 |
| 9 | Failed nil → −125, BUT tricks taken still accumulate bags | Hand 4 |
| 10 | Bag penalty tier locked at PRE-round score, not post-round | **Bag tier lock test (pre 249 → post ≥250 stays in sub-250 tier; asserts 216, not the 266 a post-round tier would give)** |
| 11 | Sub-250: every 5 bags = −50; can fire multiple times per round (`floor(new/5) − floor(old/5)`) | Sub-250 bag test (bags 4 → 11 = 2 × −50) |
| 12 | 250+: every 10 bags = −100; 9 bags crosses 0 thresholds | 250+ bag test (bags 8 → 11 = 1 × −100) |
| 13 | Bags carry forward across rounds (never reset by penalty) | All Hand-N tests + Sub-250 test |
| 14 | Reaching target with strictly higher score → `phase=game_over` | Tiebreaker tests (decisive branch) |
| 15 | Tied at target from `tiebreakerActive=false` → enter 3-round tiebreaker block | **Tiebreaker INITIAL TRIGGER test (pre 375/375 + both fail nil → 250/250 → block activates)** |
| 15b | Already-active tiebreaker mid-block (round 2 of 3) stays in `round_over` with `tiebreakerActive=true` | Tiebreaker mid-block test |
| 16 | Still tied at end of round 3 → reset `tiebreakerRound` to 0, keep `tiebreakerActive=true` (new block) | Tiebreaker round-3 still-tied test |
| 17 | Decisive end of round 3 → `phase=game_over` | Tiebreaker round-3 decisive test |
| 18 | Hidden hands: each player sanitized view contains own 13 cards + opponent's COUNT only | Test 5 (player visibility) |
| 19 | Spectator view sanitized: `hand=[]`, `handSizes=[n0, n1]`, `isSpectator=true` | Test 5 (spectator visibility) |
| 20 | Server-authoritative move validation: `playCard` throws on illegal moves even if client sends them | Test 6 |
| 21 | Auto-bid clamps strong hands ≤ 6 and never auto-nils weak hands | Test 9 |
| 22 | Auto-play returns a legal card respecting spades-not-broken | Test 9 |

---

## Gaps documented (rule absent or not implemented)

| Rule | Status | Where |
|---|---|---|
| Optional no-spade redeal | **GAP — feature absent.** No `allowNoSpadeRedeal` flag on `GameState`. Zero-spade hands DO occur (13/500 random deals observed in the test). Would require a new state flag + a `request_redeal` socket event + UI consent prompt. | Test 7 |
| Bid editing before the dealer bids (non-dealer edit-back) | **GAP — engine rejects re-bids.** Once seat 0 bids, `placeBid(state, 0, …)` throws because `currentBidder` has moved to seat 1. Adding edit-back would need a new `replace_bid` flow gated on `state.bids[other] === null`. | Test 8 |
| Bid editing by the dealer before the first card is played | **GAP — engine has no edit window.** Once both bids are locked, neither seat can revise. If the house rule allows the dealer to revise until the first lead, this needs a `replace_bid` flow gated on `state.currentTrick.length === 0 && state.trickHistory.length === 0`. | Not separately tested (covered by general lack of any `replace_bid` API) |

These gaps are recorded as passing tests with descriptive names (e.g. `"Engine REJECTS a re-bid by the non-dealer (no edit-bid support — GAP)"`) so the suite stays green while the gap is discoverable.

**Not a gap (intentional, per spec):** Spectator hand visibility. `replit.md` states spectators "never see either player's hand" and the sanitize confirms `hand=[]` for spectators in every phase including `round_over`. Earlier draft labeled this a gap; it is the product specification.

---

## Manual-judgment items (cannot be unit-tested deterministically)

- **Coin-toss UI timing.** The 3.5 s `phase=coin_toss` reveal window before round 1 is verified by the broadcast contract, but the user-facing animation/overlay is a UX judgment.
- **Auto-play "strategy" quality.** The test asserts auto-play picks a *legal* card; it does not assert that auto-play picks the *best* card. The play loop is intentionally simple (lowest legal by `cardValue`).
- **Random shuffle fairness.** `shuffleDeck` is Fisher–Yates over `Math.random()`. Statistical fairness is not asserted; we test deterministic engine behavior on hand-crafted hands.
- **Bag-penalty design choice at the 249→250 round boundary.** The engine deliberately locks the bag tier at the PRE-round score so a single round's math is deterministic. This is a rule decision, not a bug; if the house rule should be "use post-round tier", that's a design conversation, not a test fix.

---

## Edge cases covered

- Spade-break transition mid-round: leading spade illegal before break, legal after (Test 4 + Test 2).
- Nil + opponent's bag penalty interaction: opponent who takes ≥5 bags while score < 250 eats −50 even though *the nil bidder* is the one who took 0/13 tricks (Hand 3).
- Two thresholds crossed in one round: bags 4 → 11 at sub-250 = 2 × −50 (Sub-250 test).
- Tiebreaker entry with asymmetric pre-scores (250 vs 260) that still tie post-round (decisive branch test).
- Tiebreaker re-entry: `tiebreakerRound` resets to 0 on persistent tie at round 3, `tiebreakerActive` stays true.
- Renege via off-suit while holding led suit AND via leading-a-spade-before-break: both rejected (Test 6).
- Hand visibility under reconnect: per-seat sanitize never leaks opponent cards; spectator sanitize never leaks either hand (Test 5).

---

## Engine changes shipped under Phase 5

- `engine.ts` `calculateRoundScore` bag-penalty branch: **threshold locked at pre-round score** (was a single 10-bag rule). Sub-250 → 5/−50, 250+ → 10/−100. Penalties compute as threshold crossings, not as "round bags ≥ N".

No other gameplay code changed. Frontend and socket layer untouched (Phase 5 is correctness-only per the user's brief).

---

## How to extend

- Add a new scripted hand to Test 4 by calling `forceRoundOutcome({bid0, bid1, tricks0, firstBidder, preScores, preBags, ...})` and asserting on the returned `scores/bags/phase`. See `.agents/memory/scripted-round-helper.md` for the two non-obvious behaviors of the helper (stable-sort ties; even-round leader flip).
- For tied-target scenarios, prefer the both-bid-0-nil pattern with equal pre-scores ≥ 250 (avoids asymmetric sub-250 penalties).
