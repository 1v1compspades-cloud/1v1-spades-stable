import test from "node:test";
import assert from "node:assert/strict";
import {
  buildActionLogEntries,
  createLocalActionLog,
  publicStatusSummary
} from "../src/action-log.js";

test("action log records public action summaries without leaking hidden cards", () => {
  const log = createLocalActionLog({
    now: () => new Date("2026-06-13T18:30:00.000Z")
  });
  const status = {
    phase: "playing",
    viewerSeat: "player1",
    currentTurn: "player2",
    hand: [
      { id: "ace-spades", rank: "A", suit: "spades" },
      { id: "2-clubs", rank: "2", suit: "clubs" }
    ],
    playableCardStatus: { cardIds: ["ace-spades"] },
    currentTrick: [{ player: "player1", card: { id: "king-hearts", rank: "K", suit: "hearts" } }],
    lastTrick: {
      winner: "player1",
      plays: [{ player: "player2", card: { id: "queen-diamonds", rank: "Q", suit: "diamonds" } }]
    },
    score: { player1: 10, player2: 0 },
    bags: { player1: 1, player2: 0 },
    bids: { player1: 4, player2: 3 }
  };

  log.record("play card", status);
  const serialized = JSON.stringify(log.list());

  assert.match(serialized, /play card/);
  assert.match(serialized, /trick won/);
  assert.doesNotMatch(serialized, /ace-spades|2-clubs|king-hearts|queen-diamonds/);
  assert.doesNotMatch(serialized, /"hand"|"playableCardStatus"|"currentTrick"/);
});

test("action log derives hand and match completion public events", () => {
  const entries = buildActionLogEntries("play full hand", {
    phase: "match_complete",
    viewerSeat: "player1",
    currentTurn: null,
    lastTrick: { winner: "player2", plays: [] },
    matchWinner: "player2",
    score: { player1: 40, player2: 120 },
    bags: { player1: 4, player2: 0 },
    bids: { player1: 5, player2: 0 }
  }, {
    timestamp: "2026-06-13T18:31:00.000Z"
  });

  assert.deepEqual(entries.map((entry) => entry.action), [
    "play full hand",
    "trick won",
    "match complete"
  ]);
  assert.equal(entries[2].message, "Winner player2");
});

test("public status summary includes network-ready public fields only", () => {
  const summary = publicStatusSummary({
    phase: "bidding",
    viewerSeat: "spectator",
    currentTurn: "player1",
    hand: [{ id: "hidden-card" }],
    score: { player1: 0, player2: 0 },
    bags: { player1: 0, player2: 0 },
    bids: { player1: null, player2: null }
  });

  assert.deepEqual(Object.keys(summary), [
    "phase",
    "viewerSeat",
    "currentTurn",
    "score",
    "bags",
    "bidStatus",
    "lastTrickWinner"
  ]);
  assert.doesNotMatch(JSON.stringify(summary), /hidden-card|hand/);
});
