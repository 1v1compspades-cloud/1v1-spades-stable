import test from "node:test";
import assert from "node:assert/strict";
import {
  canLeadCard,
  effectiveSuit,
  getPlayableCards,
  isLeftBower,
  isLegalPlay,
  isRightBower,
  isTrump
} from "../src/index.js";

test("identifies right and left bowers", () => {
  assert.equal(isRightBower({ rank: "J", suit: "hearts" }, "hearts"), true);
  assert.equal(isLeftBower({ rank: "J", suit: "diamonds" }, "hearts"), true);
});

test("left bower effective suit is trump", () => {
  const leftBower = { rank: "J", suit: "diamonds" };

  assert.equal(effectiveSuit(leftBower, "hearts"), "hearts");
  assert.equal(isTrump(leftBower, "hearts"), true);
});

test("must follow led suit when possible", () => {
  const hand = [
    { rank: "9", suit: "clubs" },
    { rank: "A", suit: "spades" }
  ];
  const ledCard = { rank: "K", suit: "clubs" };

  assert.deepEqual(getPlayableCards(hand, ledCard, "hearts"), [{ rank: "9", suit: "clubs" }]);
  assert.equal(isLegalPlay({ hand, card: { rank: "A", suit: "spades" }, ledCard, trumpSuit: "hearts" }), false);
});

test("may throw off only when void in the led suit", () => {
  const hand = [
    { rank: "9", suit: "clubs" },
    { rank: "A", suit: "spades" }
  ];
  const ledCard = { rank: "K", suit: "diamonds" };

  assert.deepEqual(getPlayableCards(hand, ledCard, "hearts"), hand);
  assert.equal(isLegalPlay({ hand, card: { rank: "A", suit: "spades" }, ledCard, trumpSuit: "hearts" }), true);
});

test("left bower counts as trump for follow-suit logic", () => {
  const hand = [
    { rank: "J", suit: "diamonds" },
    { rank: "A", suit: "clubs" }
  ];
  const ledCard = { rank: "9", suit: "hearts" };

  assert.deepEqual(getPlayableCards(hand, ledCard, "hearts"), [{ rank: "J", suit: "diamonds" }]);
});

test("left bower follows chosen trump instead of printed suit", () => {
  const hand = [
    { rank: "J", suit: "spades" },
    { rank: "A", suit: "diamonds" }
  ];
  const ledTrump = { rank: "9", suit: "clubs" };
  const ledPrintedSuit = { rank: "9", suit: "spades" };

  assert.deepEqual(getPlayableCards(hand, ledTrump, "clubs"), [{ rank: "J", suit: "spades" }]);
  assert.deepEqual(getPlayableCards(hand, ledPrintedSuit, "clubs"), hand);
});

test("left bower does not count as its printed suit for follow-suit logic", () => {
  const hand = [
    { rank: "J", suit: "diamonds" },
    { rank: "A", suit: "clubs" }
  ];
  const ledCard = { rank: "9", suit: "diamonds" };

  assert.deepEqual(getPlayableCards(hand, ledCard, "hearts"), hand);
});

test("trump may be led immediately and there is no broken-trump restriction", () => {
  assert.equal(canLeadCard({ card: { rank: "9", suit: "hearts" }, trumpSuit: "hearts" }), true);
});
