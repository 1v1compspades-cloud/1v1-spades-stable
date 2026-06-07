import test from "node:test";
import assert from "node:assert/strict";
import { determineTrickWinner } from "../src/index.js";

test("highest card of led suit wins when no trump is played", () => {
  const winner = determineTrickWinner(
    [
      { player: "player1", card: { rank: "K", suit: "clubs" } },
      { player: "player2", card: { rank: "A", suit: "clubs" } }
    ],
    "hearts"
  );

  assert.equal(winner.player, "player2");
});

test("trump beats the led suit", () => {
  const winner = determineTrickWinner(
    [
      { player: "player1", card: { rank: "A", suit: "clubs" } },
      { player: "player2", card: { rank: "9", suit: "hearts" } }
    ],
    "hearts"
  );

  assert.equal(winner.player, "player2");
});

test("right bower beats left bower and all other trump", () => {
  const winner = determineTrickWinner(
    [
      { player: "player1", card: { rank: "J", suit: "diamonds" } },
      { player: "player2", card: { rank: "J", suit: "hearts" } }
    ],
    "hearts"
  );

  assert.equal(winner.player, "player2");
});

test("left bower beats ace of trump", () => {
  const winner = determineTrickWinner(
    [
      { player: "player1", card: { rank: "A", suit: "hearts" } },
      { player: "player2", card: { rank: "J", suit: "diamonds" } }
    ],
    "hearts"
  );

  assert.equal(winner.player, "player2");
});
