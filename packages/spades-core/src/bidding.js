import { PLAYERS } from "./index.js";

export function createBiddingState() {
  return {
    bids: {
      player1: null,
      player2: null
    },
    complete: false
  };
}

export function placeBid(state = createBiddingState(), player, bid) {
  assertPlayer(player);
  assertBid(bid);

  if (state.complete) {
    throw new Error("Bidding is already complete");
  }

  if (state.bids?.[player] !== null && state.bids?.[player] !== undefined) {
    throw new Error(`${player} has already bid`);
  }

  const bids = {
    ...state.bids,
    [player]: bid
  };

  return {
    bids,
    complete: PLAYERS.every((seat) => bids[seat] !== null && bids[seat] !== undefined)
  };
}

export function isNilBid(bid) {
  assertBid(bid);
  return bid === 0;
}

export function assertBid(bid) {
  if (!Number.isInteger(bid) || bid < 0 || bid > 13) {
    throw new Error("Bid must be an integer from 0 through 13");
  }
}

function assertPlayer(player) {
  if (!PLAYERS.includes(player)) {
    throw new Error(`Invalid player: ${player}`);
  }
}
