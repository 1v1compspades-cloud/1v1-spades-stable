// Core Spades card + game-state types shared between clients (web + mobile).
// Copied verbatim from the proven web client types so all clients parse the
// server's broadcast shape identically. The SERVER is the sole authority for
// game state; these are read-only views as received by a client.

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

/**
 * Client-facing game state, exactly as broadcast by the server for a single
 * match. A player only ever receives their own `hand`; spectators receive an
 * empty `hand` and rely on `handSizes`.
 *
 * Optional KotT/tournament fields are present because the server emits them on
 * the shared broadcast shape; the free-play app simply ignores them (mode is
 * always "quick" for free play).
 */
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
  /** Optional free-text label for this match. */
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
  /** Game mode. "quick" = standard (the only mode used by free play). */
  mode?: "quick" | "king";
  /** Challenger queue (KotT). Unused in free play. */
  challengerQueue?: { id: string; name: string }[];
  /** Per-seat consecutive match wins (KotT). Unused in free play. */
  kingStreak?: [number, number];
  /** Per-turn budget in ms (tournament rooms). Unused in free play. */
  turnTimeoutMs?: number | null;
  /** Epoch ms by which the current actor must act. Unused in free play. */
  turnDeadline?: number | null;
  /** Host has paused this match (tournament admin). Unused in free play. */
  isPaused?: boolean;
  /**
   * Set only when the match ended via the bust-out floor rule (a total reached
   * the loss floor). Null/undefined for normal target or tiebreaker wins.
   */
  gameOverReason?: string | null;
}
