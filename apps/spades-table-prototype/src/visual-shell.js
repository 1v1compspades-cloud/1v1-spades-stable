export function buildVisualShellModel(status) {
  if (!status) {
    return {
      roomCode: "none",
      phase: "none",
      viewerSeat: "none",
      currentTurn: "none",
      bidStatus: "Bid next: none",
      playableStatus: "Playable: 0",
      action: "No active room",
      handCards: [],
      currentTrick: "none",
      lastTrick: "none",
      scoreRows: [],
      bidBagRows: []
    };
  }

  const playableIds = new Set(status.playableCardStatus?.cardIds ?? []);
  const handCards = (status.hand ?? []).map((card) => {
    const id = cardIdFor(card);
    return {
      id,
      label: id,
      playable: playableIds.has(id)
    };
  });

  return {
    roomCode: status.roomCode,
    phase: status.phase,
    viewerSeat: status.viewerSeat,
    currentTurn: status.currentTurn ?? "none",
    bidStatus: `Bid next: ${status.biddingStatus?.nextBidder ?? "none"}`,
    playableStatus: `Playable: ${status.playableCardStatus?.count ?? 0}`,
    action: formatActionStatus(status),
    handCards,
    currentTrick: formatTrick(status.currentTrick),
    lastTrick: status.lastTrick
      ? `${formatTrick(status.lastTrick.plays)} | winner ${status.lastTrick.winner}`
      : "none",
    scoreRows: ["player1", "player2"].map((seat) => ({
      seat,
      score: status.score[seat],
      tricks: status.tricksTaken[seat]
    })),
    bidBagRows: ["player1", "player2"].map((seat) => ({
      seat,
      bid: status.bids[seat],
      bags: status.bags[seat],
      ready: Boolean(status.playerReady[seat])
    }))
  };
}

export function cardIdFor(card) {
  return `${card.rank}-${card.suit}`;
}

function formatTrick(plays = []) {
  if (!plays.length) return "none";
  return plays.map((play) => `${play.player}:${cardIdFor(play.card)}`).join(", ");
}

function formatActionStatus(status) {
  if (status.phase === "waiting") {
    return `Ready: ${status.playerReady.player1 ? "P1 yes" : "P1 no"} / ${status.playerReady.player2 ? "P2 yes" : "P2 no"}`;
  }
  if (status.phase === "bidding") {
    return `Bid needed from ${status.biddingStatus.nextBidder ?? "none"}`;
  }
  if (status.phase === "playing") {
    return status.currentPlayerStatus.canAct
      ? "Play one highlighted card"
      : `Waiting for ${status.currentTurn}`;
  }
  if (status.phase === "hand_complete") {
    return "Hand complete: review summary or start next hand";
  }
  if (status.phase === "match_complete") {
    return "Match complete: record history or reset";
  }
  return "No action";
}
