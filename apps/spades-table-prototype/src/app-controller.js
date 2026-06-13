import {
  applyRoomAction,
  createActionId,
  createRoom,
  joinRoom,
  leaveRoom,
  sanitizeRoomForViewer
} from "./room-state.js";
import { createInMemoryRoomRepository } from "./room-repository.js";
import {
  clearSavedActiveRoom,
  loadSavedActiveRoom,
  saveActiveRoomSession
} from "./local-room-session.js";

export function createSpadesAppController({
  repository = createInMemoryRoomRepository(),
  storage = localStorage,
  createPlayerId = defaultPlayerId
} = {}) {
  let playerId = null;
  const actionSequences = new Map();

  function currentPlayerId() {
    if (!playerId) {
      playerId = createPlayerId();
    }
    return playerId;
  }

  function createLocalRoom({
    roomCode,
    displayName = "Player 1",
    seatToken,
    matchSettings,
    coinFlipWinner,
    deck
  } = {}) {
    const room = createRoom({
      roomCode,
      seatToken,
      playerId: currentPlayerId(),
      displayName,
      matchSettings,
      coinFlipWinner,
      deck
    });
    repository.save(room);
    const session = saveActiveRoomSession({
      roomCode: room.roomCode,
      seatToken: room.players.player1.seatToken,
      playerId: currentPlayerId(),
      seat: "player1"
    }, storage);

    return {
      room,
      session,
      status: sanitizeRoomForViewer(room, session)
    };
  }

  function joinLocalRoom({
    roomCode,
    displayName = "Player 2",
    seatToken
  } = {}) {
    const currentRoom = repository.require(roomCode);
    const result = joinRoom(currentRoom, {
      seatToken,
      playerId: currentPlayerId(),
      displayName
    });
    repository.save(result.room);

    const session = result.seatToken ? saveActiveRoomSession({
      roomCode: result.room.roomCode,
      seatToken: result.seatToken,
      playerId: currentPlayerId(),
      seat: result.seat
    }, storage) : null;

    return {
      ...result,
      session,
      status: sanitizeRoomForViewer(result.room, session ?? { playerId: currentPlayerId() })
    };
  }

  function restoreActiveRoom() {
    const session = loadSavedActiveRoom(storage);
    if (!session) {
      return {
        room: null,
        session: null,
        status: null
      };
    }

    const room = repository.get(session.roomCode);
    if (!room) {
      return {
        room: null,
        session,
        status: null
      };
    }

    const result = joinRoom(room, session);
    repository.save(result.room);
    const restoredSession = saveActiveRoomSession({
      roomCode: result.room.roomCode,
      seatToken: result.seatToken,
      playerId: session.playerId,
      seat: result.seat
    }, storage);

    return {
      room: result.room,
      session: restoredSession,
      status: sanitizeRoomForViewer(result.room, restoredSession)
    };
  }

  function clearActiveRoom() {
    const cleared = clearSavedActiveRoom(storage);
    return {
      cleared,
      status: null
    };
  }

  function readyActivePlayer() {
    const { room, session } = requireActiveRoom();
    const nextRoom = applyRoomAction(room, {
      type: "ready",
      seatToken: session.seatToken,
      playerId: session.playerId
    });
    repository.save(nextRoom);

    return {
      room: nextRoom,
      session,
      status: sanitizeRoomForViewer(nextRoom, session)
    };
  }

  function submitBid({ bid, actionSequence = nextActionSequence("bid") } = {}) {
    const { room, session } = requireActiveRoom();
    const actionId = createActionId({
      roomCode: room.roomCode,
      seat: session.seat,
      type: "bid",
      sequence: actionSequence
    });
    const nextRoom = applyRoomAction(room, {
      type: "bid",
      seatToken: session.seatToken,
      playerId: session.playerId,
      bid,
      actionId,
      expectedPhase: "bidding"
    });
    repository.save(nextRoom);

    return {
      room: nextRoom,
      session,
      status: sanitizeRoomForViewer(nextRoom, session)
    };
  }

  function getBiddingStatus() {
    return getActiveRoomStatus()?.biddingStatus ?? null;
  }

  function submitPlayCard({ card, actionSequence = nextActionSequence("playCard") } = {}) {
    const { room, session } = requireActiveRoom();
    const actionId = createActionId({
      roomCode: room.roomCode,
      seat: session.seat,
      type: "playCard",
      sequence: actionSequence
    });
    const nextRoom = applyRoomAction(room, {
      type: "playCard",
      seatToken: session.seatToken,
      playerId: session.playerId,
      card,
      actionId,
      expectedPhase: "playing",
      expectedTurn: session.seat
    });
    repository.save(nextRoom);

    return {
      room: nextRoom,
      session,
      status: sanitizeRoomForViewer(nextRoom, session)
    };
  }

  function submitPlayCardById({ cardId, actionSequence } = {}) {
    const status = getActiveRoomStatus();
    if (!status) {
      throw new Error("No active room session");
    }

    const card = status.hand.find((candidate) => cardIdFor(candidate) === normalizeCardId(cardId));
    if (!card) {
      throw new Error("Card id is not in the current player's hand");
    }

    return submitPlayCard({ card, actionSequence });
  }

  function getCurrentPlayerStatus() {
    return getActiveRoomStatus()?.currentPlayerStatus ?? null;
  }

  function getPlayableCardStatus() {
    return getActiveRoomStatus()?.playableCardStatus ?? null;
  }

  function leaveActiveRoom() {
    const session = loadSavedActiveRoom(storage);
    if (!session) {
      return {
        room: null,
        cleared: null,
        status: null
      };
    }

    const room = repository.get(session.roomCode);
    const nextRoom = room ? leaveRoom(room, session) : null;
    if (nextRoom) repository.save(nextRoom);
    const cleared = clearSavedActiveRoom(storage, session.roomCode);

    return {
      room: nextRoom,
      cleared,
      status: nextRoom ? sanitizeRoomForViewer(nextRoom, {}) : null
    };
  }

  function getActiveRoomStatus() {
    const session = loadSavedActiveRoom(storage);
    if (!session) return null;
    return getRoomStatus(session.roomCode, session);
  }

  function getRoomStatus(roomCode, viewer = {}) {
    const room = repository.get(roomCode);
    return room ? sanitizeRoomForViewer(room, viewer) : null;
  }

  function requireActiveRoom() {
    const session = loadSavedActiveRoom(storage);
    if (!session) {
      throw new Error("No active room session");
    }

    const room = repository.require(session.roomCode);
    return { room, session };
  }

  return {
    repository,
    createRoom: createLocalRoom,
    joinRoom: joinLocalRoom,
    restoreActiveRoom,
    clearActiveRoom,
    readyPlayer: readyActivePlayer,
    submitBid,
    getBiddingStatus,
    submitPlayCard,
    submitPlayCardById,
    getCurrentPlayerStatus,
    getPlayableCardStatus,
    leaveRoom: leaveActiveRoom,
    getActiveRoomStatus,
    getRoomStatus
  };

  function nextActionSequence(type) {
    const current = actionSequences.get(type) ?? 0;
    const next = current + 1;
    actionSequences.set(type, next);
    return next;
  }
}

export function cardIdFor(card) {
  return `${card?.rank}-${card?.suit}`;
}

function normalizeCardId(cardId) {
  return String(cardId ?? "").trim();
}

function defaultPlayerId() {
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
