import test from "node:test";
import assert from "node:assert/strict";
import { canLeadCard, isLegalPlay, nextSpadesBroken } from "../src/index.js";

test("requires following led suit when possible", () => {
  const hand = [
    { rank: "4", suit: "hearts" },
    { rank: "A", suit: "spades" }
  ];
  const currentTrick = [{ player: "player1", card: { rank: "K", suit: "hearts" } }];

  assert.equal(isLegalPlay({ hand, card: hand[0], currentTrick }), true);
  assert.equal(isLegalPlay({ hand, card: hand[1], currentTrick }), false);
});

test("allows any card when player cannot follow suit", () => {
  const hand = [
    { rank: "4", suit: "clubs" },
    { rank: "A", suit: "spades" }
  ];
  const currentTrick = [{ player: "player1", card: { rank: "K", suit: "hearts" } }];

  assert.equal(isLegalPlay({ hand, card: hand[0], currentTrick }), true);
  assert.equal(isLegalPlay({ hand, card: hand[1], currentTrick }), true);
});

test("prevents leading spades before broken unless only spades remain", () => {
  const mixedHand = [
    { rank: "4", suit: "hearts" },
    { rank: "A", suit: "spades" }
  ];
  const spadesOnlyHand = [
    { rank: "2", suit: "spades" },
    { rank: "A", suit: "spades" }
  ];

  assert.equal(canLeadCard({ hand: mixedHand, card: mixedHand[1], spadesBroken: false }), false);
  assert.equal(canLeadCard({ hand: mixedHand, card: mixedHand[1], spadesBroken: true }), true);
  assert.equal(canLeadCard({ hand: spadesOnlyHand, card: spadesOnlyHand[0], spadesBroken: false }), true);
});

test("marks spades broken when a spade is played off-suit", () => {
  assert.equal(nextSpadesBroken({
    currentTrick: [{ player: "player1", card: { rank: "K", suit: "hearts" } }],
    card: { rank: "2", suit: "spades" },
    spadesBroken: false
  }), true);
  assert.equal(nextSpadesBroken({
    currentTrick: [{ player: "player1", card: { rank: "K", suit: "spades" } }],
    card: { rank: "2", suit: "spades" },
    spadesBroken: false
  }), false);
});
