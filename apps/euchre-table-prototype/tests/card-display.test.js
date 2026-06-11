import test from "node:test";
import assert from "node:assert/strict";
import { sortDisplayHand } from "../src/card-display.js";

test("display hand sorting puts trump bowers first without mutating state", () => {
  const hand = [
    { rank: "A", suit: "clubs" },
    { rank: "9", suit: "hearts" },
    { rank: "J", suit: "diamonds" },
    { rank: "A", suit: "hearts" },
    { rank: "J", suit: "hearts" }
  ];
  const original = hand.map((card) => ({ ...card }));

  const sorted = sortDisplayHand(hand, "hearts");

  assert.deepEqual(hand, original);
  assert.notEqual(sorted, hand);
  assert.deepEqual(sorted, [
    { rank: "J", suit: "hearts" },
    { rank: "J", suit: "diamonds" },
    { rank: "A", suit: "hearts" },
    { rank: "9", suit: "hearts" },
    { rank: "A", suit: "clubs" }
  ]);
});

test("display hand sorting groups non-trump suits high to low", () => {
  const sorted = sortDisplayHand([
    { rank: "9", suit: "spades" },
    { rank: "A", suit: "clubs" },
    { rank: "Q", suit: "clubs" },
    { rank: "K", suit: "diamonds" },
    { rank: "10", suit: "spades" }
  ], "hearts");

  assert.deepEqual(sorted, [
    { rank: "A", suit: "clubs" },
    { rank: "Q", suit: "clubs" },
    { rank: "K", suit: "diamonds" },
    { rank: "10", suit: "spades" },
    { rank: "9", suit: "spades" }
  ]);
});
