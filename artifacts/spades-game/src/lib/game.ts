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
  matchTarget: number;
  tiebreakerActive: boolean;
  tiebreakerRound: number;
  /** Card counts per seat. Always populated. Spectators rely on this. */
  handSizes: [number, number];
  /** Number of spectators watching the room. */
  spectatorCount: number;
  /** True if this client is a spectator (no hand, no input). */
  isSpectator: boolean;
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

/**
 * Returns true if this card is a legal play right now.
 * Mirrors the server-side canPlayCard logic so the UI can dim illegal cards
 * before the player even clicks. The server still enforces all rules.
 */
export function isCardPlayable(
  card: Card,
  gs: GameState,
  playerIndex: 0 | 1
): boolean {
  // Not this player's turn (or in the trick-display delay window)
  if (gs.currentTurnIndex !== playerIndex) return false;
  if (gs.phase !== "playing") return false;

  const hand = gs.hand;
  const trick = gs.currentTrick;

  if (trick.length === 0) {
    // Leading a trick: spades are illegal unless spades are broken
    // OR the player has nothing but spades.
    if (!gs.spadesBroken && card.suit === "spades") {
      return hand.every(c => c.suit === "spades");
    }
    return true;
  }

  // Following: must follow the lead suit if possible.
  const ledSuit = trick[0].card.suit;
  const hasLeadSuit = hand.some(c => c.suit === ledSuit);
  if (hasLeadSuit) {
    return card.suit === ledSuit;
  }

  // No cards of the lead suit — any card is playable.
  return true;
}
