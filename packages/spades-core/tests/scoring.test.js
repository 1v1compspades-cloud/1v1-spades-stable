import test from "node:test";
import assert from "node:assert/strict";
import { scoreHand, scorePlayerHand } from "../src/index.js";

test("scores made bids as bid times 10 plus overtricks", () => {
  assert.equal(scorePlayerHand({ bid: 4, tricks: 6 }), 42);
});

test("scores missed bids as negative bid times 10", () => {
  assert.equal(scorePlayerHand({ bid: 4, tricks: 3 }), -40);
});

test("scores both players and preserves previous score", () => {
  const result = scoreHand({
    bids: { player1: 4, player2: 3 },
    tricksTaken: { player1: 5, player2: 2 },
    score: { player1: 100, player2: 50 },
    bags: { player1: 0, player2: 0 }
  });

  assert.deepEqual(result.score, { player1: 141, player2: 20 });
  assert.deepEqual(result.bags, { player1: 1, player2: 0 });
  assert.deepEqual(result.handScores, { player1: 41, player2: -30 });
});
