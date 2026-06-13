export const SUITS = Object.freeze(["clubs", "diamonds", "hearts", "spades"]);
export const RANKS = Object.freeze(["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]);
export const PLAYERS = Object.freeze(["player1", "player2"]);

export const DEFAULT_MATCH_SETTINGS = Object.freeze({
  modeId: "standard1v1",
  targetScore: 500,
  nilBonus: 100,
  nilPenalty: -100,
  bagThreshold: 10,
  bagPenalty: -100
});

export * from "./deck.js";
export * from "./bidding.js";
export * from "./legal-play.js";
export * from "./trick-winner.js";
export * from "./scoring.js";
export * from "./match-complete.js";
