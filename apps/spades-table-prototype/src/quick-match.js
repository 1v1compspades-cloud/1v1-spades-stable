export function createQuickMatchQueue({
  boundary,
  createRoomCode = defaultRoomCode
} = {}) {
  if (!boundary) {
    throw new Error("Quick Match requires a Spades server boundary");
  }

  const waiting = [];
  const entriesByPlayer = new Map();
  const processedActionIds = new Set();
  let nextRoomNumber = 1;

  function joinQueue(request = {}) {
    const identity = normalizeIdentity(request.identity);
    validateIdentity(identity);
    const actionId = normalizeActionId(request.actionId);

    if (actionId && processedActionIds.has(actionId)) {
      return queueResponse({
        request,
        status: statusFor(identity),
        duplicate: true,
        actionId
      });
    }

    const existing = entriesByPlayer.get(identity.playerId);
    if (existing) {
      if (actionId) processedActionIds.add(actionId);
      return queueResponse({
        request,
        status: statusFor(identity),
        duplicate: Boolean(actionId),
        actionId,
        error: null
      });
    }

    const entry = {
      identity,
      displayName: request.displayName ?? "Player",
      joinedAt: new Date().toISOString()
    };
    waiting.push(entry);
    entriesByPlayer.set(identity.playerId, entry);
    if (actionId) processedActionIds.add(actionId);

    if (waiting.length >= 2) {
      const player1 = waiting.shift();
      const player2 = waiting.shift();
      entriesByPlayer.delete(player1.identity.playerId);
      entriesByPlayer.delete(player2.identity.playerId);
      const match = createMatch({ player1, player2, request });

      return queueResponse({
        request,
        status: {
          state: "matched",
          waitingCount: waiting.length,
          roomCode: match.roomCode,
          seat: player2.identity.playerId === identity.playerId ? "player2" : "player1"
        },
        actionId,
        match
      });
    }

    return queueResponse({
      request,
      status: statusFor(identity),
      actionId
    });
  }

  function leaveQueue(request = {}) {
    const identity = normalizeIdentity(request.identity);
    validateIdentity(identity);
    const actionId = normalizeActionId(request.actionId);

    if (actionId && processedActionIds.has(actionId)) {
      return queueResponse({
        request,
        status: statusFor(identity),
        duplicate: true,
        actionId
      });
    }

    const entry = entriesByPlayer.get(identity.playerId);
    if (entry) {
      entriesByPlayer.delete(identity.playerId);
      const index = waiting.indexOf(entry);
      if (index >= 0) waiting.splice(index, 1);
    }
    if (actionId) processedActionIds.add(actionId);

    return queueResponse({
      request,
      status: {
        state: "left",
        waitingCount: waiting.length,
        queued: false
      },
      actionId
    });
  }

  function statusFor(identity = {}) {
    const queued = Boolean(identity.playerId && entriesByPlayer.has(identity.playerId));
    return {
      state: queued ? "waiting" : "idle",
      waitingCount: waiting.length,
      queued
    };
  }

  function createMatch({ player1, player2, request }) {
    const roomCode = request.roomCode ?? createRoomCode(nextRoomNumber);
    nextRoomNumber += 1;
    const created = boundary.handle({
      type: "createRoom",
      roomCode,
      displayName: player1.displayName,
      identity: player1.identity,
      requestId: `${request.requestId ?? "quick-match"}:create`
    });
    const joined = boundary.handle({
      type: "joinRoom",
      roomCode,
      displayName: player2.displayName,
      identity: player2.identity,
      requestId: `${request.requestId ?? "quick-match"}:join`
    });

    return {
      roomCode,
      player1: {
        identity: player1.identity,
        response: created
      },
      player2: {
        identity: player2.identity,
        response: joined
      },
      spectatorView: joined.spectatorView
    };
  }

  return {
    joinQueue,
    leaveQueue,
    statusFor,
    waitingPlayers() {
      return waiting.map((entry) => ({
        playerId: entry.identity.playerId,
        displayName: entry.displayName
      }));
    }
  };
}

function queueResponse({
  request,
  status,
  actionId = request.actionId ?? null,
  duplicate = false,
  match = null,
  error = null
}) {
  return {
    ok: !error,
    statusCode: error ? (error.statusCode ?? 400) : 200,
    requestId: request.requestId ?? null,
    type: request.type,
    actionId,
    duplicate,
    queue: status,
    match,
    session: sessionFor(request.identity, match),
    view: seatViewFor(request.identity, match),
    spectatorView: match?.spectatorView ?? null,
    error: error ? { message: error.message } : null
  };
}

function sessionFor(identity, match) {
  if (!match) return null;
  if (match.player1.identity.playerId === identity?.playerId) return match.player1.response.session;
  if (match.player2.identity.playerId === identity?.playerId) return match.player2.response.session;
  return null;
}

function seatViewFor(identity, match) {
  if (!match) return null;
  if (match.player1.identity.playerId === identity?.playerId) return match.player1.response.view;
  if (match.player2.identity.playerId === identity?.playerId) return match.player2.response.view;
  return match.spectatorView;
}

function normalizeIdentity(identity = {}) {
  return {
    playerId: String(identity.playerId ?? "").trim(),
    seatToken: String(identity.seatToken ?? "").trim() || undefined
  };
}

function validateIdentity(identity) {
  if (!identity.playerId) {
    throw quickMatchError(400, "Quick Match identity.playerId is required");
  }
  if (!identity.seatToken) {
    throw quickMatchError(400, "Quick Match identity.seatToken is required");
  }
}

function normalizeActionId(actionId) {
  return String(actionId ?? "").trim() || null;
}

function quickMatchError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function defaultRoomCode(nextRoomNumber) {
  return `QM${String(nextRoomNumber).padStart(4, "0")}`;
}
