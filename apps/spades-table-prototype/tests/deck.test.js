import test from "node:test";
import assert from "node:assert/strict";
import { createDeck, createShuffledDeck, deal } from "../../../packages/spades-core/src/deck.js";

test("shuffled decks preserve all cards while changing hosted deal order", () => {
  const randomValues = Array.from({ length: 52 }, (_, index) => ((index * 17) % 51) / 51);
  let index = 0;
  const shuffled = createShuffledDeck(() => randomValues[index++ % randomValues.length]);

  assert.equal(shuffled.length, 52);
  assert.equal(new Set(shuffled.map((card) => `${card.rank}-${card.suit}`)).size, 52);
  assert.notDeepEqual(shuffled, createDeck());

  const dealt = deal(shuffled);
  const player1Suits = new Set(dealt.hands.player1.map((card) => card.suit));
  assert.ok(player1Suits.size > 1);
});
