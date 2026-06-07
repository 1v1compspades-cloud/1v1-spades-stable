import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseTrumpForCurrentPlayer,
  createMatch,
  passTrumpForCurrentPlayer,
  playCard
} from "../src/table-state.js";

const fixedDeck = [
  { rank: "A", suit: "clubs" },
  { rank: "K", suit: "clubs" },
  { rank: "Q", suit: "clubs" },
  { rank: "J", suit: "diamonds" },
  { rank: "9", suit: "spades" },
  { rank: "9", suit: "clubs" },
  { rank: "A", suit: "hearts" },
  { rank: "K", suit: "hearts" },
  { rank: "Q", suit: "hearts" },
  { rank: "10", suit: "hearts" },
  { rank: "9", suit: "hearts" },
  { rank: "10", suit: "clubs" },
  { rank: "J", suit: "clubs" },
  { rank: "A", suit: "diamonds" },
  { rank: "K", suit: "diamonds" },
  { rank: "Q", suit: "diamonds" },
  { rank: "10", suit: "diamonds" },
  { rank: "9", suit: "diamonds" },
  { rank: "J", suit: "hearts" },
  { rank: "A", suit: "spades" },
  { rank: "K", suit: "spades" },
  { rank: "Q", suit: "spades" },
  { rank: "J", suit: "spades" },
  { rank: "10", suit: "spades" }
];

test("creates a local match with face-up hands, kitty, and upcard", () => {
  const match = createMatch({ deck: fixedDeck });

  assert.equal(match.hand.hands.player1.length, 5);
  assert.equal(match.hand.hands.player2.length, 5);
  assert.equal(match.hand.kitty.length, 14);
  assert.deepEqual(match.hand.upcard, { rank: "9", suit: "hearts" });
  assert.equal(match.hand.phase, "selectingTrump");
});

test("selects trump and starts trick play with leader able to lead trump immediately", () => {
  const match = chooseTrumpForCurrentPlayer(createMatch({ deck: fixedDeck }), "hearts");

  assert.equal(match.hand.phase, "playing");
  assert.equal(match.hand.trumpSuit, "hearts");
  assert.equal(match.hand.maker, "player1");
  assert.equal(match.hand.currentPlayer, "player1");

  const afterLead = playCard(match, "player1", { rank: "J", suit: "diamonds" });
  assert.equal(afterLead.hand.currentTrick.length, 1);
});

test("enforces following led suit when possible", () => {
  let match = chooseTrumpForCurrentPlayer(createMatch({ deck: fixedDeck }), "hearts");

  match = playCard(match, "player1", { rank: "A", suit: "clubs" });

  assert.throws(
    () => playCard(match, "player2", { rank: "A", suit: "hearts" }),
    /not legal/
  );
});

test("plays five tricks, scores the hand, and tracks match winner", () => {
  let match = createMatch({ modeId: "fastGame", deck: fixedDeck });
  match = { ...match, score: { player1: 0, player2: 3 } };
  match = chooseTrumpForCurrentPlayer(match, "hearts");

  match = playCard(match, "player1", { rank: "J", suit: "diamonds" });
  match = playCard(match, "player2", { rank: "A", suit: "hearts" });
  match = playCard(match, "player1", { rank: "9", suit: "spades" });
  match = playCard(match, "player2", { rank: "K", suit: "hearts" });
  match = playCard(match, "player2", { rank: "Q", suit: "hearts" });
  match = playCard(match, "player1", { rank: "A", suit: "clubs" });
  match = playCard(match, "player2", { rank: "10", suit: "hearts" });
  match = playCard(match, "player1", { rank: "K", suit: "clubs" });
  match = playCard(match, "player2", { rank: "9", suit: "clubs" });
  match = playCard(match, "player1", { rank: "Q", suit: "clubs" });

  assert.equal(match.hand.phase, "matchComplete");
  assert.deepEqual(match.hand.tricksWon, { player1: 2, player2: 3 });
  assert.deepEqual(match.score, { player1: 0, player2: 5 });
  assert.equal(match.winner, "player2");
});

test("Classic Casual double pass starts redeal flow", () => {
  let match = createMatch({ modeId: "classicCasual", deck: fixedDeck });

  match = passTrumpForCurrentPlayer(match);
  match = passTrumpForCurrentPlayer(match);
  match = passTrumpForCurrentPlayer(match);
  match = passTrumpForCurrentPlayer(match);

  assert.equal(match.hand.phase, "redealRequired");
});
