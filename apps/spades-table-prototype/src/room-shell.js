export function buildRoomShellModel(sanitizedRoom) {
  return {
    title: `Room ${sanitizedRoom.roomCode}`,
    phase: sanitizedRoom.phase,
    viewerSeat: sanitizedRoom.viewerSeat,
    alreadySeated: sanitizedRoom.alreadySeated,
    players: sanitizedRoom.players,
    ready: sanitizedRoom.playerReady,
    score: sanitizedRoom.score,
    bags: sanitizedRoom.bags,
    handNumber: sanitizedRoom.handNumber,
    currentTurn: sanitizedRoom.currentTurn,
    dealer: sanitizedRoom.dealer,
    firstPlayer: sanitizedRoom.firstPlayer,
    winner: sanitizedRoom.winner,
    lastTrick: sanitizedRoom.lastTrick,
    hiddenHandCounts: sanitizedRoom.hiddenHandCounts,
    biddingStatus: sanitizedRoom.biddingStatus,
    currentPlayerStatus: sanitizedRoom.currentPlayerStatus,
    playableCardStatus: sanitizedRoom.playableCardStatus,
    roomFull: Boolean(sanitizedRoom.players.player1 && sanitizedRoom.players.player2),
    spectator: sanitizedRoom.viewerSeat === "spectator"
  };
}

export function renderRoomShellText(sanitizedRoom) {
  const model = buildRoomShellModel(sanitizedRoom);
  const player1Name = model.players.player1?.displayName ?? "Open";
  const player2Name = model.players.player2?.displayName ?? "Open";

  return [
    model.title,
    `Phase: ${model.phase}`,
    `Viewer: ${model.viewerSeat}`,
    `Players: ${player1Name} vs ${player2Name}`,
    `Ready: ${Boolean(model.ready.player1)} / ${Boolean(model.ready.player2)}`,
    `Score: ${model.score.player1}-${model.score.player2}`,
    `Bags: ${model.bags.player1}-${model.bags.player2}`,
    `Hand: ${model.handNumber}`,
    `Turn: ${model.currentTurn ?? "none"}`,
    `Bid next: ${model.biddingStatus?.nextBidder ?? "none"}`,
    `Can act: ${Boolean(model.currentPlayerStatus?.canAct)}`,
    `Playable cards: ${model.playableCardStatus?.count ?? 0}`,
    `Room full: ${model.roomFull}`,
    `Spectator: ${model.spectator}`,
    `Hidden cards: ${model.hiddenHandCounts.player1}-${model.hiddenHandCounts.player2}`,
    `Winner: ${model.winner ?? "none"}`
  ].join("\n");
}
