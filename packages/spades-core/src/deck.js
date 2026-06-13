import { PLAYERS, RANKS, SUITS } from "./index.js";

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function assertCard(card) {
  if (!card || !RANKS.includes(card.rank) || !SUITS.includes(card.suit)) {
    throw new Error("Invalid Spades card");
  }
}

export function cardsEqual(left, right) {
  return left?.rank === right?.rank && left?.suit === right?.suit;
}

export function deal(deck = createDeck()) {
  if (!Array.isArray(deck) || deck.length !== 52) {
    throw new Error("Deal requires a 52-card deck");
  }

  const seen = new Set();
  for (const card of deck) {
    assertCard(card);
    const key = `${card.rank}-${card.suit}`;
    if (seen.has(key)) {
      throw new Error("Deal requires a deck without duplicate cards");
    }
    seen.add(key);
  }

  return {
    hands: {
      [PLAYERS[0]]: deck.slice(0, 13),
      [PLAYERS[1]]: deck.slice(13, 26)
    },
    stock: deck.slice(26)
  };
}
