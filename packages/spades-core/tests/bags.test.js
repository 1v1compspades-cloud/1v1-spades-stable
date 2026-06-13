import test from "node:test";
import assert from "node:assert/strict";
import { bagsForHand, scoreHand } from "../src/index.js";

test("records one bag for each overtrick", () => {
  assert.equal(bagsForHand({ bid: 5, tricks: 7 }), 2);
  assert.equal(bagsForHand({ bid: 5, tricks: 4 }), 0);
});

test("applies bag penalty at the configured threshold", () => {
  const result = scoreHand({
    bids: { player1: 4, player2: 4 },
    tricksTaken: { player1: 5, player2: 4 },
    score: { player1: 90, player2: 90 },
    bags: { player1: 9, player2: 0 }
  });

  assert.equal(result.score.player1, 31);
  assert.equal(result.bags.player1, 0);
  assert.equal(result.bagPenalties.player1, -100);
});
