import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, deal } from "../src/index.js";

test("creates a standard 52-card 1v1 Spades deck", () => {
  const deck = createDeck();

  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => `${card.rank}-${card.suit}`)).size, 52);
  assert.deepEqual(deck[0], { rank: "2", suit: "clubs" });
  assert.deepEqual(deck.at(-1), { rank: "A", suit: "spades" });
});

test("deals 13 hidden cards to each player and preserves undealt stock", () => {
  const result = deal(createDeck());

  assert.equal(result.hands.player1.length, 13);
  assert.equal(result.hands.player2.length, 13);
  assert.equal(result.stock.length, 26);
  assert.deepEqual(result.hands.player1[0], { rank: "2", suit: "clubs" });
  assert.deepEqual(result.hands.player2[0], { rank: "2", suit: "diamonds" });
});

test("rejects invalid deal decks", () => {
  const duplicateDeck = createDeck();
  duplicateDeck[0] = duplicateDeck[1];

  assert.throws(() => deal([]), /52-card deck/);
  assert.throws(() => deal(duplicateDeck), /duplicate/);
});
