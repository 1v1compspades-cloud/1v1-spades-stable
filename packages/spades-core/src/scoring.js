import { DEFAULT_MATCH_SETTINGS, PLAYERS } from "./index.js";
import { assertBid } from "./bidding.js";

export function scoreHand({
  bids,
  tricksTaken,
  score = { player1: 0, player2: 0 },
  bags = { player1: 0, player2: 0 },
  settings = DEFAULT_MATCH_SETTINGS
} = {}) {
  const nextScore = { ...score };
  const nextBags = { ...bags };
  const handScores = {};
  const bagPenalties = {};

  for (const player of PLAYERS) {
    const bid = bids?.[player];
    const tricks = tricksTaken?.[player];
    assertBid(bid);

    if (!Number.isInteger(tricks) || tricks < 0 || tricks > 13) {
      throw new Error("Tricks taken must be an integer from 0 through 13");
    }

    const handScore = scorePlayerHand({
      bid,
      tricks,
      nilBonus: settings.nilBonus,
      nilPenalty: settings.nilPenalty
    });
    const earnedBags = bagsForHand({ bid, tricks });
    const bagResult = applyBagPenalty({
      currentBags: nextBags[player] ?? 0,
      earnedBags,
      threshold: settings.bagThreshold,
      penalty: settings.bagPenalty
    });

    handScores[player] = handScore;
    bagPenalties[player] = bagResult.penaltyScore;
    nextBags[player] = bagResult.bags;
    nextScore[player] = (nextScore[player] ?? 0) + handScore + bagResult.penaltyScore;
  }

  return {
    score: nextScore,
    bags: nextBags,
    handScores,
    bagPenalties
  };
}

export function scorePlayerHand({ bid, tricks, nilBonus = 100, nilPenalty = -100 } = {}) {
  assertBid(bid);
  if (!Number.isInteger(tricks) || tricks < 0 || tricks > 13) {
    throw new Error("Tricks taken must be an integer from 0 through 13");
  }

  if (bid === 0) {
    return tricks === 0 ? nilBonus : nilPenalty;
  }

  if (tricks < bid) {
    return bid * -10;
  }

  return bid * 10 + (tricks - bid);
}

export function bagsForHand({ bid, tricks } = {}) {
  assertBid(bid);
  if (!Number.isInteger(tricks) || tricks < 0 || tricks > 13) {
    throw new Error("Tricks taken must be an integer from 0 through 13");
  }

  if (bid === 0) {
    return tricks;
  }

  return Math.max(0, tricks - bid);
}

function applyBagPenalty({ currentBags, earnedBags, threshold, penalty }) {
  const totalBags = currentBags + earnedBags;
  if (totalBags < threshold) {
    return {
      bags: totalBags,
      penaltyScore: 0
    };
  }

  const penalties = Math.floor(totalBags / threshold);
  return {
    bags: totalBags % threshold,
    penaltyScore: penalties * penalty
  };
}
