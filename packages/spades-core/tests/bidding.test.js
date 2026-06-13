import test from "node:test";
import assert from "node:assert/strict";
import { createBiddingState, isNilBid, placeBid } from "../src/index.js";

test("accepts bids from 0 through 13", () => {
  let state = createBiddingState();
  state = placeBid(state, "player1", 0);
  state = placeBid(state, "player2", 13);

  assert.deepEqual(state.bids, { player1: 0, player2: 13 });
  assert.equal(state.complete, true);
});

test("treats bid 0 as nil", () => {
  assert.equal(isNilBid(0), true);
  assert.equal(isNilBid(1), false);
});

test("locks both bids before trick play starts", () => {
  let state = createBiddingState();
  state = placeBid(state, "player1", 4);

  assert.equal(state.complete, false);
  assert.throws(() => placeBid(state, "player1", 5), /already bid/);

  state = placeBid(state, "player2", 3);
  assert.equal(state.complete, true);
  assert.throws(() => placeBid(state, "player1", 6), /already complete/);
});

test("rejects invalid bids", () => {
  assert.throws(() => placeBid(createBiddingState(), "player1", -1), /0 through 13/);
  assert.throws(() => placeBid(createBiddingState(), "player1", 14), /0 through 13/);
  assert.throws(() => placeBid(createBiddingState(), "player1", 2.5), /0 through 13/);
});
