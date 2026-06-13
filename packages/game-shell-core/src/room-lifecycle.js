import {
  createSeatViewerHelpers,
  normalizeDisplayName,
  normalizePlayerId
} from "./seat-viewer.js";

export function createTwoPlayerRoomLifecycle({
  seats,
  generateSeatToken,
  now = () => new Date().toISOString(),
  syncRoom = (room) => room
} = {}) {
  const seatHelpers = createSeatViewerHelpers({ seats });
  const [seat1, seat2] = seatHelpers.seats;

  function createRoomShell({
    roomCode,
    seatToken = generateSeatToken(),
    playerId,
    displayName = "Player 1",
    extra = {}
  } = {}) {
    const timestamp = now();
    return syncRoom({
      roomCode,
      players: {
        [seat1]: createPlayerSeat({
          seat: seat1,
          seatToken,
          playerId,
          displayName
        }),
        [seat2]: null
      },
      playerReady: {
        [seat1]: false,
        [seat2]: false
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      ...extra
    });
  }

  function joinRoomShell(room, {
    seatToken,
    playerId,
    displayName = "Player 2"
  } = {}) {
    const existingSeat = seatHelpers.getViewerSeat(room, { seatToken, playerId });
    if (existingSeat !== "spectator") {
      return {
        room: markConnected(room, existingSeat),
        seat: existingSeat,
        seatToken: room.players[existingSeat].seatToken,
        alreadySeated: true
      };
    }

    const normalizedPlayerId = normalizePlayerId(playerId);
    if (normalizedPlayerId && seatHelpers.playerIdMatchesSeatedPlayer(room, normalizedPlayerId)) {
      throw lifecycleError(409, "This player is already seated in this room");
    }

    if (room.players[seat2]) {
      return {
        room,
        seat: "spectator",
        seatToken: null,
        alreadySeated: false
      };
    }

    const nextSeatToken = seatToken || generateSeatToken();
    return {
      room: syncRoom({
        ...room,
        players: {
          ...room.players,
          [seat2]: createPlayerSeat({
            seat: seat2,
            seatToken: nextSeatToken,
            playerId: normalizedPlayerId,
            displayName
          })
        },
        updatedAt: now()
      }),
      seat: seat2,
      seatToken: nextSeatToken,
      alreadySeated: false
    };
  }

  function leaveRoomShell(room, viewer = {}) {
    const seat = seatHelpers.getViewerSeat(room, viewer);
    if (!seatHelpers.isPlayerSeat(seat)) {
      return syncRoom(room);
    }

    return syncRoom({
      ...room,
      players: {
        ...room.players,
        [seat]: {
          ...room.players[seat],
          connected: false
        }
      },
      updatedAt: now()
    });
  }

  function markReady(room, seat, ready = true) {
    return syncRoom({
      ...room,
      playerReady: {
        ...room.playerReady,
        [seat]: ready
      },
      updatedAt: now()
    });
  }

  function resetForNewMatch(room, extra = {}) {
    return syncRoom({
      ...room,
      playerReady: {
        [seat1]: false,
        [seat2]: false
      },
      ...extra,
      updatedAt: now()
    });
  }

  function markConnected(room, seat) {
    return syncRoom({
      ...room,
      players: {
        ...room.players,
        [seat]: {
          ...room.players[seat],
          connected: true
        }
      },
      updatedAt: now()
    });
  }

  return {
    ...seatHelpers,
    createRoomShell,
    joinRoomShell,
    leaveRoomShell,
    markReady,
    resetForNewMatch,
    markConnected
  };
}

function createPlayerSeat({ seat, seatToken, playerId, displayName }) {
  return {
    seat,
    seatToken,
    playerId: normalizePlayerId(playerId),
    displayName: normalizeDisplayName(displayName),
    connected: true
  };
}

function lifecycleError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
