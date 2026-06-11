import {
  SUITS,
  effectiveSuit,
  isLeftBower,
  isRightBower,
  isTrump
} from "../../../packages/euchre-core/src/index.js";

const NON_TRUMP_RANK_ORDER = Object.freeze({
  A: 6,
  K: 5,
  Q: 4,
  J: 3,
  "10": 2,
  "9": 1
});

const TRUMP_RANK_ORDER = Object.freeze({
  A: 5,
  K: 4,
  Q: 3,
  "10": 2,
  "9": 1
});

export function sortDisplayHand(hand = [], trumpSuit = null) {
  const cards = [...hand];
  if (!trumpSuit) {
    return cards.sort(compareWithoutTrump);
  }

  return cards.sort((left, right) => compareWithTrump(left, right, trumpSuit));
}

function compareWithTrump(left, right, trumpSuit) {
  const leftTrump = isTrump(left, trumpSuit);
  const rightTrump = isTrump(right, trumpSuit);

  if (leftTrump !== rightTrump) return leftTrump ? -1 : 1;

  if (leftTrump && rightTrump) {
    return trumpSortValue(right, trumpSuit) - trumpSortValue(left, trumpSuit);
  }

  const leftSuit = effectiveSuit(left, trumpSuit);
  const rightSuit = effectiveSuit(right, trumpSuit);
  const suitDiff = suitSortValue(leftSuit) - suitSortValue(rightSuit);
  if (suitDiff !== 0) return suitDiff;

  return nonTrumpSortValue(right) - nonTrumpSortValue(left);
}

function compareWithoutTrump(left, right) {
  const suitDiff = suitSortValue(left.suit) - suitSortValue(right.suit);
  if (suitDiff !== 0) return suitDiff;
  return nonTrumpSortValue(right) - nonTrumpSortValue(left);
}

function trumpSortValue(card, trumpSuit) {
  if (isRightBower(card, trumpSuit)) return 100;
  if (isLeftBower(card, trumpSuit)) return 99;
  return TRUMP_RANK_ORDER[card.rank] ?? 0;
}

function nonTrumpSortValue(card) {
  return NON_TRUMP_RANK_ORDER[card.rank] ?? 0;
}

function suitSortValue(suit) {
  const index = SUITS.indexOf(suit);
  return index === -1 ? SUITS.length : index;
}
