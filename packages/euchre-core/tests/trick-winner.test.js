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

test("trump ranking follows right, left, ace, king, queen, ten, nine", () => {
  const trumpCardsFromLowToHigh = [
    { rank: "9", suit: "hearts" },
    { rank: "10", suit: "hearts" },
    { rank: "Q", suit: "hearts" },
    { rank: "K", suit: "hearts" },
    { rank: "A", suit: "hearts" },
    { rank: "J", suit: "diamonds" },
    { rank: "J", suit: "hearts" }
  ];

  for (let index = 1; index < trumpCardsFromLowToHigh.length; index += 1) {
    const lowerTrump = trumpCardsFromLowToHigh[index - 1];
    const higherTrump = trumpCardsFromLowToHigh[index];
    const winner = determineTrickWinner(
      [
        { player: "player1", card: lowerTrump },
        { player: "player2", card: higherTrump }
      ],
      "hearts"
    );

    assert.equal(winner.player, "player2");
  }
});

test("non-trump ranking follows ace, king, queen, jack, ten, nine", () => {
  const nonTrumpCardsFromLowToHigh = [
    { rank: "9", suit: "clubs" },
    { rank: "10", suit: "clubs" },
    { rank: "J", suit: "clubs" },
    { rank: "Q", suit: "clubs" },
    { rank: "K", suit: "clubs" },
    { rank: "A", suit: "clubs" }
  ];

  for (let index = 1; index < nonTrumpCardsFromLowToHigh.length; index += 1) {
    const lowerCard = nonTrumpCardsFromLowToHigh[index - 1];
    const higherCard = nonTrumpCardsFromLowToHigh[index];
    const winner = determineTrickWinner(
      [
        { player: "player1", card: lowerCard },
        { player: "player2", card: higherCard }
      ],
      "hearts"
    );

    assert.equal(winner.player, "player2");
  }
});

test("left bower led sets trump as the effective led suit", () => {
  const winner = determineTrickWinner(
    [
      { player: "player1", card: { rank: "J", suit: "diamonds" } },
      { player: "player2", card: { rank: "A", suit: "hearts" } }
    ],
    "hearts"
  );

  assert.equal(winner.player, "player1");
});
