import test from "node:test";
import assert from "node:assert/strict";
import { getMatchWinner, isMatchComplete } from "../src/index.js";

test("completes the match when a player reaches target score after a hand", () => {
  assert.equal(isMatchComplete({ score: { player1: 501, player2: 440 } }), true);
  assert.equal(getMatchWinner({ score: { player1: 501, player2: 440 } }), "player1");
});

test("continues tied matches at or above target score", () => {
  assert.equal(isMatchComplete({ score: { player1: 510, player2: 510 } }), false);
  assert.equal(getMatchWinner({ score: { player1: 510, player2: 510 } }), null);
});

test("does not complete below target score", () => {
  assert.equal(isMatchComplete({ score: { player1: 499, player2: 200 } }), false);
  assert.equal(getMatchWinner({ score: { player1: 499, player2: 200 } }), null);
});
