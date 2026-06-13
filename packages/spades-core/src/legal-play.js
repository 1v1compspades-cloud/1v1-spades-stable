import { assertCard, cardsEqual } from "./deck.js";

export function isLegalPlay({ hand, card, currentTrick = [], spadesBroken = false } = {}) {
  assertHandContainsCard(hand, card);

  if (!currentTrick.length) {
    return canLeadCard({ hand, card, spadesBroken });
  }

  const ledSuit = currentTrick[0]?.card?.suit;
  const canFollowSuit = hand.some((candidate) => candidate.suit === ledSuit);
  return !canFollowSuit || card.suit === ledSuit;
}

export function canLeadCard({ hand, card, spadesBroken = false } = {}) {
  assertHandContainsCard(hand, card);

  if (card.suit !== "spades" || spadesBroken) {
    return true;
  }

  return hand.every((candidate) => candidate.suit === "spades");
}

export function nextSpadesBroken({ currentTrick = [], card, spadesBroken = false } = {}) {
  assertCard(card);
  if (spadesBroken || card.suit !== "spades" || !currentTrick.length) {
    return spadesBroken;
  }

  return currentTrick[0]?.card?.suit !== "spades";
}

function assertHandContainsCard(hand, card) {
  assertCard(card);
  if (!Array.isArray(hand) || !hand.some((candidate) => cardsEqual(candidate, card))) {
    throw new Error("Card must be in hand");
  }
}
