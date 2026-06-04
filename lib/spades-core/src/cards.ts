// Pure, framework-free card helpers shared across clients.
// Logic copied verbatim from the proven web client so behavior is identical;
// the server still enforces all rules authoritatively.

import type { Card, Rank, Suit, GameState } from "./types";

export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

/**
 * Platform-neutral hex colors for each suit (usable on web and React Native).
 * Mirrors the web client's intent (spades=slate-900, hearts=red-600,
 * clubs=emerald-700, diamonds=blue-700). The web app keeps its own Tailwind
 * class map; this hex map exists for non-Tailwind (mobile) consumers.
 */
export const SUIT_HEX_COLORS: Record<Suit, string> = {
  spades: "#0f172a",
  hearts: "#dc2626",
  clubs: "#047857",
  diamonds: "#1d4ed8",
};

/** Rank order from highest to lowest, for hand sorting. */
export const RANK_ORDER: Rank[] = [
  "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2",
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
    .map((suit) => ({
      suit,
      cards: hand
        .filter((c) => c.suit === suit)
        .sort((a, b) => rankIndex.get(a.rank)! - rankIndex.get(b.rank)!),
    }))
    .filter((g) => g.cards.length > 0);
}

/**
 * Returns true if this card is a legal play right now.
 * Mirrors the server-side card-legality logic so the UI can dim illegal cards
 * before the player even taps. The server still enforces all rules.
 */
export function isCardPlayable(card: Card, gs: GameState, playerIndex: 0 | 1): boolean {
  // Not this player's turn (or in the trick-display delay window)
  if (gs.currentTurnIndex !== playerIndex) return false;
  if (gs.phase !== "playing") return false;

  const hand = gs.hand;
  const trick = gs.currentTrick;

  if (trick.length === 0) {
    // Leading a trick: spades are illegal unless spades are broken
    // OR the player has nothing but spades.
    if (!gs.spadesBroken && card.suit === "spades") {
      return hand.every((c) => c.suit === "spades");
    }
    return true;
  }

  // Following: must follow the lead suit if possible.
  const ledSuit = trick[0].card.suit;
  const hasLeadSuit = hand.some((c) => c.suit === ledSuit);
  if (hasLeadSuit) {
    return card.suit === ledSuit;
  }

  // No cards of the lead suit — any card is playable.
  return true;
}
