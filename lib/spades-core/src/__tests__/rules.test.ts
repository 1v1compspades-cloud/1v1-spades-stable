// Shared-core verification: scoring rules + card-legality helpers.
// Run with: pnpm --filter @workspace/spades-core run test

import {
  nilRoundDelta,
  bagRuleForTarget,
  applyBagPenalty,
  NIL_MADE_BONUS,
  NIL_FAILED_BASE_PENALTY,
} from "../rules";
import { isCardPlayable, sortHandBySuit, RANK_ORDER } from "../cards";
import type { Card, GameState } from "../types";

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean): void {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.error(`  \u2717 ${label}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown): void {
  check(`${label} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}

// ── Nil scoring ──────────────────────────────────────────────────────────────
eq("nil made = +100", nilRoundDelta(0), NIL_MADE_BONUS);
eq("nil made constant is 100", NIL_MADE_BONUS, 100);
eq("nil failed base is -100", NIL_FAILED_BASE_PENALTY, -100);
eq("nil failed with 1 trick = -99", nilRoundDelta(1), -99);
eq("nil failed with 3 tricks = -97", nilRoundDelta(3), -97);

// ── Bag rules by race target ─────────────────────────────────────────────────
eq("race to 250 → 5 bags / -50", bagRuleForTarget(250), { threshold: 5, penalty: 50 });
eq("race to 500 → 10 bags / -100", bagRuleForTarget(500), { threshold: 10, penalty: 100 });
eq("target 300 still uses the <500 rule", bagRuleForTarget(300), { threshold: 5, penalty: 50 });

// ── Bag penalty + rollover ───────────────────────────────────────────────────
eq("250: 4 bags → no penalty, carry 4", applyBagPenalty(250, 4), { penalty: 0, carriedBags: 4 });
eq("250: 5 bags → -50, carry 0", applyBagPenalty(250, 5), { penalty: 50, carriedBags: 0 });
eq("250: 6 bags → -50, carry 1", applyBagPenalty(250, 6), { penalty: 50, carriedBags: 1 });
eq("500: 11 bags → -100, carry 1", applyBagPenalty(500, 11), { penalty: 100, carriedBags: 1 });
eq("500: 9 bags → no penalty, carry 9", applyBagPenalty(500, 9), { penalty: 0, carriedBags: 9 });

// ── Hand sorting ─────────────────────────────────────────────────────────────
eq("RANK_ORDER has 13 ranks, A first, 2 last", [RANK_ORDER.length, RANK_ORDER[0], RANK_ORDER[12]], [13, "A", "2"]);
const sortGroups = sortHandBySuit([
  { suit: "diamonds", rank: "2" },
  { suit: "spades", rank: "K" },
  { suit: "spades", rank: "A" },
]);
eq("sortHandBySuit groups spades first, A before K", [sortGroups[0].suit, sortGroups[0].cards.map((c) => c.rank)], ["spades", ["A", "K"]]);

// ── Card legality ────────────────────────────────────────────────────────────
function baseState(overrides: Partial<GameState>): GameState {
  return {
    roomCode: "TEST",
    phase: "playing",
    players: [],
    hand: [],
    opponentHandSize: 13,
    bids: [null, null],
    currentBidder: null,
    tricks: [0, 0],
    currentTrick: [],
    currentTurnIndex: 0,
    spadesBroken: false,
    scores: [0, 0],
    bags: [0, 0],
    roundHistory: [],
    roundNumber: 1,
    trickLeader: 0,
    matchTarget: 250,
    tiebreakerActive: false,
    tiebreakerRound: 0,
    handSizes: [13, 13],
    spectatorCount: 0,
    isSpectator: false,
    lastCardPlayed: null,
    lastCompletedTrick: [],
    coinFlipWinner: null,
    firstBidderRound1: null,
    ...overrides,
  };
}

const spadeLead: Card = { suit: "spades", rank: "A" };
const heartCard: Card = { suit: "hearts", rank: "5" };

check(
  "cannot lead spades when not broken and holding other suits",
  isCardPlayable(spadeLead, baseState({ hand: [spadeLead, heartCard], currentTrick: [] }), 0) === false,
);
check(
  "can lead spades when holding only spades",
  isCardPlayable(spadeLead, baseState({ hand: [spadeLead], currentTrick: [] }), 0) === true,
);
check(
  "must follow lead suit when able",
  isCardPlayable(spadeLead, baseState({
    hand: [spadeLead, heartCard],
    currentTrick: [{ card: heartCard, playerIndex: 1 }],
  }), 0) === false,
);
check(
  "not your turn → not playable",
  isCardPlayable(heartCard, baseState({ hand: [heartCard], currentTurnIndex: 1 }), 0) === false,
);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\nspades-core: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
