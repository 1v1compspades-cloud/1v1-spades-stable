export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K"|"A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface GameState {
  roomCode: string;
  phase: "waiting" | "bidding" | "playing" | "round_over" | "game_over";
  players: ({ id: string; name: string; index: 0 | 1 } | null)[];
  hand: Card[];
  opponentHandSize: number;
  bids: (number | null)[];
  currentBidder: 0 | 1 | null;
  tricks: [number, number];
  currentTrick: { card: Card; playerIndex: 0 | 1 }[];
  currentTurnIndex: 0 | 1 | null;
  spadesBroken: boolean;
  scores: [number, number];
  bags: [number, number];
  roundHistory: {
    round: number;
    scores: [number, number];
    bags: [number, number];
    bids: [number, number];
    tricks: [number, number];
  }[];
  roundNumber: number;
  trickLeader: 0 | 1;
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣"
};

export const SUIT_COLORS: Record<Suit, string> = {
  spades: "text-slate-900",
  clubs: "text-slate-900",
  hearts: "text-red-700",
  diamonds: "text-red-700"
};
