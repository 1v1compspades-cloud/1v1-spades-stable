import {
  applyRoomAction,
  createActionId,
  createRoom,
  getViewerSeat,
  joinRoom,
  leaveRoom,
  sanitizeRoomForViewer
} from "./room-state.js";
import { createInMemoryRoomRepository } from "../../../packages/game-shell-core/src/index.js";

export const SPADES_REQUEST_TYPES = Object.freeze([
  "createRoom",
  "joinRoom",
  "ready",
  "bid",
  "playCard",
  "leaveRoom",
  "nextHand",
  "newMatch",
  "rematch"
]);

const PLAYER_ACTION_TYPES = new Set([
  "ready",
  "bid",
  "playCard",
  "leaveRoom",
  "nextHand",
  "newMatch",
  "rematch"
]);

const ROOM_ACTION_TYPES = Object.freeze({
  ready: "ready",
  bid: "bid",
  playCard: "playCard",
  nextHand: "startNextHand",
  newMatch: "startNewMatch",
  rematch: "requestRematch"
});

const EXPECTED_PHASES = Object.freeze({
  bid: "bidding",
  playCard: "playing",
  nextHand: "hand_complete",
  newMatch: "match_complete",
  rematch: "match_complete"
});

export function createMockSpadesTransport(options = {}) {
  const boundary = createSpadesServerBoundary(options);

  return {
    repository: boundary.repository,
    handle(request) {
      return boundary.handle(request);
    }
  };
}

export function createSpadesServerBoundary({
  repository = createInMemoryRoomRepository()
} = {}) {
  function handle(request = {}) {
    try {
      validateRequest(request);

      if (request.type === "createRoom") return handleCreateRoom(request);
      if (request.type === "joinRoom") return handleJoinRoom(request);
      if (request.type === "leaveRoom") return handleLeaveRoom(request);
      if (ROOM_ACTION_TYPES[request.type]) return handleRoomAction(request);

      throw boundaryError(400, `Unsupported Spades request type: ${request.type}`);
    } catch (error) {
      return failureResponse(request, error, repository);
    }
  }

  function handleCreateRoom(request) {
    const identity = normalizeIdentity(request.identity);
    const room = createRoom({
      roomCode: request.roomCode,
      seatToken: identity.seatToken,
      playerId: identity.playerId,
      displayName: request.displayName,
      matchSettings: request.matchSettings,
      coinFlipWinner: request.coinFlipWinner,
      deck: request.deck
    });
    repository.save(room);

    return successResponse({
      request,
      room,
      viewer: {
        roomCode: room.roomCode,
        seatToken: room.players.player1.seatToken,
        playerId: identity.playerId,
        seat: "player1"
      },
      session: {
        roomCode: room.roomCode,
        seatToken: room.players.player1.seatToken,
        playerId: identity.playerId,
        seat: "player1"
      }
    });
  }

  function handleJoinRoom(request) {
    const identity = normalizeIdentity(request.identity);
    const room = repository.require(request.roomCode);
    const result = joinRoom(room, {
      seatToken: identity.seatToken,
      playerId: identity.playerId,
      displayName: request.displayName,
      spectator: request.spectator === true
    });
    repository.save(result.room);

    const session = result.seatToken ? {
      roomCode: result.room.roomCode,
      seatToken: result.seatToken,
      playerId: identity.playerId,
      seat: result.seat
    } : null;

    return successResponse({
      request,
      room: result.room,
      viewer: session ?? { playerId: identity.playerId },
      session,
      extra: {
        seat: result.seat,
        roomFull: result.seat === "spectator"
      }
    });
  }

  function handleLeaveRoom(request) {
    const identity = normalizeIdentity(request.identity);
    const room = repository.require(request.roomCode);
    const actionId = actionIdForRequest(request, room, identity, "leaveRoom");
    const duplicate = Boolean(actionId && room.appliedActionIds?.includes(actionId));
    const nextRoom = duplicate ? room : leaveRoom(room, identity);
    repository.save(nextRoom);

    return successResponse({
      request,
      room: nextRoom,
      viewer: {},
      actionId,
      duplicate,
      session: null
    });
  }

  function handleRoomAction(request) {
    const identity = normalizeIdentity(request.identity);
    const room = repository.require(request.roomCode);
    const seat = getViewerSeat(room, identity);
    const actionId = actionIdForRequest(request, room, identity, request.type);
    const duplicate = Boolean(actionId && room.appliedActionIds?.includes(actionId));
    if (duplicate) {
      return successResponse({
        request,
        room,
        viewer: identity,
        actionId,
        duplicate
      });
    }
    const nextRoom = applyRoomAction(room, {
      type: ROOM_ACTION_TYPES[request.type],
      seatToken: identity.seatToken,
      playerId: identity.playerId,
      bid: request.bid,
      card: cardForRequest(request, room, seat),
      deck: request.deck,
      actionId,
      expectedPhase: EXPECTED_PHASES[request.type],
      expectedTurn: request.type === "playCard" ? seat : undefined
    });
    repository.save(nextRoom);

    return successResponse({
      request,
      room: nextRoom,
      viewer: identity,
      actionId,
      duplicate
    });
  }

  return {
    repository,
    handle,
    handlers: Object.freeze({
      createRoom: handleCreateRoom,
      joinRoom: handleJoinRoom,
      ready: handleRoomAction,
      bid: handleRoomAction,
      playCard: handleRoomAction,
      leaveRoom: handleLeaveRoom,
      nextHand: handleRoomAction,
      newMatch: handleRoomAction
    })
  };
}

export function validateRequest(request = {}) {
  if (!SPADES_REQUEST_TYPES.includes(request.type)) {
    throw boundaryError(400, "Request type is required");
  }

  const identity = normalizeIdentity(request.identity);
  if (!identity.playerId) {
    throw boundaryError(400, "Request identity.playerId is required");
  }

  if (request.type !== "createRoom" && !request.roomCode) {
    throw boundaryError(400, "Request roomCode is required");
  }

  if (PLAYER_ACTION_TYPES.has(request.type) && !identity.seatToken) {
    throw boundaryError(400, "Player action identity.seatToken is required");
  }

  if (request.type === "bid" && !Number.isInteger(request.bid)) {
    throw boundaryError(400, "Bid request requires an integer bid");
  }

  if (request.type === "playCard" && !request.cardId) {
    throw boundaryError(400, "Play-card request requires cardId");
  }

  return true;
}

export function successResponse({
  request,
  room,
  viewer,
  session = undefined,
  actionId = request.actionId ?? null,
  duplicate = false,
  extra = {}
}) {
  return {
    ok: true,
    statusCode: 200,
    requestId: request.requestId ?? null,
    type: request.type,
    actionId,
    duplicate,
    session,
    view: sanitizeRoomForViewer(room, viewer),
    spectatorView: sanitizeRoomForViewer(room, {}),
    error: null,
    ...extra
  };
}

export function failureResponse(request, error, repository = null) {
  const room = request?.roomCode ? tryGetRoom(request.roomCode, repository) : null;

  return {
    ok: false,
    statusCode: error?.statusCode ?? 500,
    requestId: request?.requestId ?? null,
    type: request?.type ?? null,
    actionId: request?.actionId ?? null,
    duplicate: false,
    session: null,
    view: null,
    spectatorView: room ? sanitizeRoomForViewer(room, {}) : null,
    error: {
      message: error?.message ?? "Spades boundary request failed"
    }
  };
}

function tryGetRoom(roomCode, repository) {
  return repository?.get?.(roomCode) ?? null;
}

function normalizeIdentity(identity = {}) {
  return {
    playerId: String(identity.playerId ?? "").trim(),
    seatToken: String(identity.seatToken ?? "").trim() || undefined
  };
}

function actionIdForRequest(request, room, identity, type) {
  if (request.actionId) return String(request.actionId);

  const seat = getViewerSeat(room, identity);
  return createActionId({
    roomCode: room.roomCode,
    seat,
    type,
    sequence: request.actionSequence ?? request.requestId
  });
}

function cardForRequest(request, room, seat) {
  if (request.type !== "playCard") return undefined;

  const cardId = String(request.cardId ?? "").trim();
  const hand = room.game?.hands?.[seat] ?? [];
  const card = hand.find((candidate) => `${candidate.rank}-${candidate.suit}` === cardId);
  if (!card) {
    throw boundaryError(400, "Card id is not in the current player's hand");
  }
  return card;
}

function boundaryError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
