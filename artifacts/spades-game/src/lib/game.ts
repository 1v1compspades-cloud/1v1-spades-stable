export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K"|"A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export interface GameState {
  roomCode: string;
  phase: "waiting" | "coin_toss" | "shuffling" | "bidding" | "playing" | "round_over" | "game_over";
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
  /** Optional free-text label for this match (e.g. "Quarterfinal 1"). */
  matchLabel?: string;
  /** Most recent card played by either player this match. Null until first play. */
  lastCardPlayed: { card: Card; playerIndex: 0 | 1 } | null;
  /** Two cards from the most recently completed trick; empty until first trick resolves. */
  lastCompletedTrick: { card: Card; playerIndex: 0 | 1 }[];
  /**
   * Seat (0 or 1) that won the one-time coin toss. The winner bids SECOND in
   * Round 1; the loser bids FIRST. Bidding order alternates every round after.
   */
  coinFlipWinner: 0 | 1 | null;
  /** Seat that bids first in Round 1 — always the coin toss loser. */
  firstBidderRound1: 0 | 1 | null;
  /** Per-seat epoch-ms of last meaningful activity (join/reconnect/bid/play). */
  lastActiveAt?: [number, number];
  /** Per-seat ready flag for the pre-match lobby. */
  ready?: [boolean, boolean];
  /** Game mode. "quick" = standard. "king" = King of the Table. */
  mode?: "quick" | "king";
  /** Challenger queue (KotT). Empty in quick mode. */
  challengerQueue?: { id: string; name: string }[];
  /** Per-seat consecutive match wins (KotT). */
  kingStreak?: [number, number];
  /** Link back to the Custom Tournament bracket (if this is a bracket match). */
  tournamentRef?: { code: string; matchId: string };
  /** Per-turn budget in ms for tournament rooms (null/undefined otherwise). */
  turnTimeoutMs?: number | null;
  /** Epoch ms by which the current actor must act before auto-play kicks in. */
  turnDeadline?: number | null;
}

// ── Custom Tournament shared types ──────────────────────────────────────────

export type TournamentStatus = "lobby" | "in_progress" | "complete";
export type TournamentSize = 4 | 8 | 16 | 32;
export type BracketSeat = "A" | "B";

export interface TournamentMatch {
  id: string;
  round: number;
  position: number;
  playerA: { name: string } | null;
  playerB: { name: string } | null;
  roomCode: string | null;
  winner: BracketSeat | null;
  winnerName: string | null;
}

export interface TournamentState {
  code: string;
  name: string;
  hostName: string;
  size: TournamentSize;
  matchTarget: number;
  status: TournamentStatus;
  players: { id: string; name: string }[];
  rounds: TournamentMatch[][];
  champion: string | null;
  eliminated: string[];
  createdAt: number;
}

export interface MatchAssignedPayload {
  tournamentCode: string;
  matchId: string;
  roomCode: string;
  playerIndex: 0 | 1;
  matchLabel: string;
  opponentName: string;
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣"
};

export const SUIT_COLORS: Record<Suit, string> = {
  spades:   "text-slate-900",
  hearts:   "text-red-600",
  clubs:    "text-emerald-700",
  diamonds: "text-blue-700",
};

/** Rank order from highest to lowest, for hand sorting. */
export const RANK_ORDER: Rank[] = [
  "A","K","Q","J","10","9","8","7","6","5","4","3","2",
];

/**
 * Sort a hand into suit groups, high-to-low within each suit.
 * Suit order alternates color for visual clarity: ♠ ♥ ♣ ♦.
 * Returns an array of suit groups (each non-empty), preserving input cards.
 */
export function sortHandBySuit(hand: Card[]): { suit: Suit; cards: Card[] }[] {
  const order: Suit[] = ["spades", "hearts", "clubs", "diamonds"];
  const rankIndex = new Map(RANK_ORDER.map((r, i) => [r, i]));
  return order
    .map(suit => ({
      suit,
      cards: hand
        .filter(c => c.suit === suit)
        .sort((a, b) => (rankIndex.get(a.rank)! - rankIndex.get(b.rank)!)),
    }))
    .filter(g => g.cards.length > 0);
}

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
