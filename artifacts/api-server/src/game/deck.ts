export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

const RANK_VALUES: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealHands(deck: Card[]): [Card[], Card[]] {
  const hand1 = deck.slice(0, 26);
  const hand2 = deck.slice(26, 52);
  return [hand1, hand2];
}

export function cardValue(card: Card): number {
  return RANK_VALUES[card.rank];
}

export function winsTrick(
  led: Card,
  challenger: Card,
  spadeBroken: boolean
): boolean {
  if (challenger.suit === "spades" && led.suit !== "spades") {
    return true;
  }
  if (challenger.suit !== led.suit) {
    return false;
  }
  return cardValue(challenger) > cardValue(led);
}

export function determineTrickWinner(
  trick: { card: Card; playerIndex: number }[]
): number {
  const led = trick[0];
  let winner = led;

  for (let i = 1; i < trick.length; i++) {
    const current = trick[i];
    if (winsTrick(winner.card, current.card, true)) {
      winner = current;
    }
  }
  return winner.playerIndex;
}

export function cardToString(card: Card): string {
  return `${card.rank}${card.suit[0].toUpperCase()}`;
}

export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = {
    spades: 0,
    hearts: 1,
    diamonds: 2,
    clubs: 3,
  };
  return [...hand].sort((a, b) => {
    const suitDiff = suitOrder[a.suit] - suitOrder[b.suit];
    if (suitDiff !== 0) return suitDiff;
    return cardValue(b) - cardValue(a);
  });
}
