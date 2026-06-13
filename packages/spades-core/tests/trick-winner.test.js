import test from "node:test";
import assert from "node:assert/strict";
import { determineTrickWinner } from "../src/index.js";

test("highest led suit wins when no spade is played", () => {
  const winner = determineTrickWinner([
    { player: "player1", card: { rank: "10", suit: "hearts" } },
    { player: "player2", card: { rank: "A", suit: "hearts" } }
  ]);

  assert.equal(winner, "player2");
});

test("highest spade wins when any spade is played", () => {
  const winner = determineTrickWinner([
    { player: "player1", card: { rank: "A", suit: "hearts" } },
    { player: "player2", card: { rank: "2", suit: "spades" } }
  ]);

  assert.equal(winner, "player2");
});

test("higher spade beats lower spade", () => {
  const winner = determineTrickWinner([
    { player: "player1", card: { rank: "3", suit: "spades" } },
    { player: "player2", card: { rank: "K", suit: "spades" } }
  ]);

  assert.equal(winner, "player2");
});
