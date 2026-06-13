import { PLAYERS, RANKS } from "./index.js";
import { assertCard } from "./deck.js";

export function determineTrickWinner(trick) {
  if (!Array.isArray(trick) || trick.length !== 2) {
    throw new Error("A 1v1 Spades trick requires exactly two plays");
  }

  for (const play of trick) {
    if (!PLAYERS.includes(play?.player)) {
      throw new Error(`Invalid trick player: ${play?.player}`);
    }
    assertCard(play.card);
  }

  const ledSuit = trick[0].card.suit;
  const winningSuit = trick.some((play) => play.card.suit === "spades") ? "spades" : ledSuit;

  return trick
    .filter((play) => play.card.suit === winningSuit)
    .sort((left, right) => rankValue(right.card.rank) - rankValue(left.card.rank))[0].player;
}

function rankValue(rank) {
  return RANKS.indexOf(rank);
}
