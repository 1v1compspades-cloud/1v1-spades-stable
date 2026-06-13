export const TWO_PLAYER_SEATS = Object.freeze(["player1", "player2"]);

export function createSeatViewerHelpers({ seats = TWO_PLAYER_SEATS } = {}) {
  const seatList = [...seats];

  function getViewerSeat(room, { seatToken, playerId } = {}) {
    const normalizedPlayerId = normalizePlayerId(playerId);
    for (const seat of seatList) {
      const player = room.players?.[seat];
      if (!player) continue;
      if (seatToken && player.seatToken === seatToken) return seat;
      if (normalizedPlayerId && player.playerId === normalizedPlayerId) return seat;
    }
    return "spectator";
  }

  function isPlayerSeat(seat) {
    return seatList.includes(seat);
  }

  function sanitizePlayers(players) {
    return Object.fromEntries(seatList.map((seat) => {
      const player = players?.[seat];
      return [seat, player ? {
        seat,
        displayName: player.displayName,
        connected: player.connected
      } : null];
    }));
  }

  function playerIdMatchesSeatedPlayer(room, playerId) {
    return seatList.some((seat) => room.players?.[seat]?.playerId === playerId);
  }

  return {
    seats: seatList,
    getViewerSeat,
    isPlayerSeat,
    sanitizePlayers,
    playerIdMatchesSeatedPlayer
  };
}

export function normalizePlayerId(playerId) {
  const value = String(playerId ?? "").trim();
  return value ? value.slice(0, 80) : null;
}

export function normalizeDisplayName(displayName) {
  const value = String(displayName ?? "").trim();
  if (!value) {
    throw new Error("Enter a display name");
  }
  return value.slice(0, 32);
}
