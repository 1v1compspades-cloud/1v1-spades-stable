import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, deal, RANKS, SUITS } from "../src/index.js";

test("creates a 24-card Euchre deck with 9 through Ace in each suit", () => {
  const deck = createDeck();

  assert.equal(deck.length, 24);
  assert.deepEqual(new Set(deck.map((card) => card.rank)), new Set(RANKS));
  assert.deepEqual(new Set(deck.map((card) => card.suit)), new Set(SUITS));
  assert.equal(new Set(deck.map((card) => `${card.rank}-${card.suit}`)).size, 24);
});

test("deals 5 cards to each player and leaves the rest as kitty with top upcard", () => {
  const deck = createDeck();
  const result = deal(deck);

  assert.equal(result.hands.player1.length, 5);
  assert.equal(result.hands.player2.length, 5);
  assert.equal(result.kitty.length, 14);
  assert.deepEqual(result.upcard, deck[10]);
  assert.deepEqual(result.kitty[0], result.upcard);

  const allLocations = [
    ...result.hands.player1,
    ...result.hands.player2,
    ...result.kitty
  ];
  assert.equal(new Set(allLocations.map((card) => `${card.rank}-${card.suit}`)).size, 24);
});
