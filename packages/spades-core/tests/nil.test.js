import test from "node:test";
import assert from "node:assert/strict";
import { bagsForHand, scorePlayerHand } from "../src/index.js";

test("awards nil bonus when a nil bidder takes zero tricks", () => {
  assert.equal(scorePlayerHand({ bid: 0, tricks: 0 }), 100);
});

test("applies nil penalty when a nil bidder takes any trick", () => {
  assert.equal(scorePlayerHand({ bid: 0, tricks: 1 }), -100);
});

test("counts failed nil tricks as bags", () => {
  assert.equal(bagsForHand({ bid: 0, tricks: 2 }), 2);
});
