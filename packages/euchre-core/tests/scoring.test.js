import test from "node:test";
import assert from "node:assert/strict";
import { applyScore, getMatchWinner, GAME_MODES, scoreHand } from "../src/index.js";

test("maker scores 1 point for 3 tricks", () => {
  const score = scoreHand({ maker: "player1", tricksWon: { player1: 3, player2: 2 } });

  assert.deepEqual(score.points, { player1: 1, player2: 0 });
});

test("maker scores 1 point for 4 tricks", () => {
  const score = scoreHand({ maker: "player1", tricksWon: { player1: 4, player2: 1 } });

  assert.deepEqual(score.points, { player1: 1, player2: 0 });
});

test("maker scores 2 points for 5 tricks", () => {
  const score = scoreHand({ maker: "player1", tricksWon: { player1: 5, player2: 0 } });

  assert.deepEqual(score.points, { player1: 2, player2: 0 });
  assert.equal(score.sweep, true);
});

test("defender euchres maker and scores 2 points", () => {
  const score = scoreHand({ maker: "player1", tricksWon: { player1: 2, player2: 3 } });

  assert.deepEqual(score.points, { player1: 0, player2: 2 });
  assert.equal(score.euchred, true);
});

test("first player to target score wins", () => {
  const handScore = scoreHand({ maker: "player1", tricksWon: { player1: 3, player2: 2 } });
  const score = applyScore({ player1: 9, player2: 8 }, handScore);

  assert.equal(getMatchWinner(score, GAME_MODES.communityCompetitive.targetScore), "player1");
  assert.equal(getMatchWinner({ player1: 4, player2: 3 }, GAME_MODES.fastGame.targetScore), null);
  assert.equal(getMatchWinner({ player1: 4, player2: 5 }, GAME_MODES.fastGame.targetScore), "player2");
});
