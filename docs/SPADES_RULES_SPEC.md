# 1v1 Spades Rules Specification

## Scope

This spec defines the first supported Spades variant for Spades Master: free-play 1v1 Spades. It is intentionally scoped for a test-first rules engine and does not define UI, networking, animations, account storage, or tournament brackets.

## Players

- Two seated players: `player1` and `player2`.
- Spectators may exist at the room layer later, but spectators are not part of `spades-core`.
- A reconnecting player must resume the same seat when room identity proves the session.

## Deck

- Standard 52-card deck.
- Suits: clubs, diamonds, hearts, spades.
- Ranks: 2 through A.
- Rank order, low to high: 2, 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A.

## Deal

Default 1v1 deal:

- Each player receives 13 cards.
- Remaining cards are set aside as undealt stock for this variant.
- Player hands are hidden from the opponent and spectators.
- Deal order should alternate by hand once room-level hand sequencing exists.

Open Phase 1 decision:

- Whether undealt cards are unused for the hand or support a draw/discard 1v1 Spades variant. Phase 0 defaults to unused stock to keep the first engine simple and testable.

## Bidding

- Each player bids after the deal and before trick play.
- Valid standard bid range: 0 through 13.
- A bid of 0 is a nil bid.
- Both bids must be locked before trick play starts.
- Bids cannot be changed after trick play starts.

## Nil

- Nil means the player commits to taking zero tricks.
- Successful nil scores a nil bonus.
- Failed nil applies a nil penalty and the taken tricks may still contribute to bags according to the scoring configuration.

Default values for Phase 1 tests:

- Nil success: +100.
- Nil failure: -100.

Blind nil is not included in Phase 0.

## Bags

- A bag is each trick taken above a non-nil bid.
- Bags accumulate across hands.
- When a player reaches the bag threshold, a bag penalty is applied and the threshold amount is removed from the bag count.

Default values for Phase 1 tests:

- Bag threshold: 10.
- Bag penalty: -100.

Open Phase 1 decision:

- Whether failed nil overtricks count as bags in the default 1v1 mode. The initial recommendation is yes, because tricks above zero are overtricks.

## Legal Play

- The leader may lead any suit before spades are broken except spades.
- The leader may lead spades after spades are broken.
- A player may always lead spades if their hand contains only spades.
- The follower must follow the led suit when able.
- If the follower cannot follow suit, they may play any card.
- Spades are broken when a spade is played on a trick where spades were not led.

## Trick Resolution

- Each trick contains one card from each player.
- If any spade is played, the highest spade wins.
- If no spade is played, the highest card of the led suit wins.
- Trick winner leads the next trick.
- Trick counts are updated after each trick.

## Scoring

Default standard scoring:

- If a non-nil player meets or exceeds their bid, score `bid * 10`.
- Each overtrick above bid adds 1 point and 1 bag.
- If a non-nil player misses their bid, score `bid * -10`.
- Successful nil scores +100.
- Failed nil scores -100.
- Bag penalties apply after hand score is calculated.

Each player has independent bid, tricks, score, and bags in 1v1 Spades.

## Match Completion

- Default target score: 500.
- A match ends when at least one player reaches or exceeds the target score after a completed hand.
- If both players cross the target in the same hand, the higher score wins.
- If scores are tied at or above target, continue until a hand ends with a non-tied score.

## Reconnect Expectations

Reconnect belongs to the future room layer, but the rules engine must make it safe:

- Engine state must be serializable.
- Hidden hands must remain attributable by seat.
- Current phase must be explicit.
- Bids, played cards, trick history, scores, and bags must survive persistence.
- Replaying a submitted action after reconnect must be rejected or idempotently ignored by room/action ownership code.

## Non-Goals

- No 4-player partnership Spades.
- No blind nil.
- No table UI.
- No card rendering.
- No networking.
- No legacy Spades lobby behavior.

