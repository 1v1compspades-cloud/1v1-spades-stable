const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PLAYERS = ["player1", "player2"];

export function createSpadesPushNotifier({ fetchImpl = globalThis.fetch, logger = console } = {}) {
  const tokensByPlayerId = new Map();
  const lastSentByKey = new Map();

  function registerToken({ playerId, token, displayName = "" } = {}) {
    const normalizedPlayerId = String(playerId ?? "").trim();
    const normalizedToken = String(token ?? "").trim();
    if (!normalizedPlayerId || !isExpoPushToken(normalizedToken)) {
      return { ok: false, error: { message: "Valid playerId and Expo push token are required" } };
    }
    tokensByPlayerId.set(normalizedPlayerId, {
      token: normalizedToken,
      displayName: String(displayName ?? "").trim(),
      updatedAt: new Date().toISOString()
    });
    return { ok: true, playerId: normalizedPlayerId };
  }

  function notifyForBoundaryResponse({ payload, room, source = "unknown" } = {}) {
    if (!payload?.ok || !room || payload.duplicate) return [];
    const message = notificationForRoomEvent(room, payload);
    if (!message) return [];
    return sendToSeat(room, message.seat, message, source);
  }

  function sendToSeat(room, seat, message, source) {
    const playerId = room.players?.[seat]?.playerId;
    const tokenRecord = playerId ? tokensByPlayerId.get(playerId) : null;
    if (!tokenRecord?.token) return [];

    const key = [room.roomCode, seat, message.type, message.detail].join(":");
    const now = Date.now();
    const lastSent = lastSentByKey.get(key) ?? 0;
    if (now - lastSent < 3000) return [];
    lastSentByKey.set(key, now);

    const push = {
      to: tokenRecord.token,
      sound: "default",
      title: message.title,
      body: message.body,
      data: {
        type: message.type,
        roomCode: room.roomCode,
        seat,
        source
      }
    };

    void sendExpoPush(push, logger, fetchImpl);
    return [push];
  }

  return {
    registerToken,
    notifyForBoundaryResponse,
    tokensByPlayerId
  };
}

export function notificationForRoomEvent(room, payload) {
  if (!room || !payload?.type) return null;
  if (payload.type === "joinRoom") {
    return roomReadyNotification(room, payload);
  }
  if (["ready", "nextHand", "newMatch"].includes(payload.type) && room.phase === "bidding") {
    return bidNotification(room);
  }
  if (payload.type === "bid") {
    if (room.phase === "bidding") return bidNotification(room);
    if (room.phase === "playing") return turnNotification(room);
  }
  if (payload.type === "playCard" && room.phase === "playing") {
    return turnNotification(room);
  }
  return null;
}

function roomReadyNotification(room, payload) {
  if (room.phase !== "waiting") return null;
  if (!room.players?.player1 || !room.players?.player2) return null;
  const joinedSeat = payload.session?.seat === "player2" ? "player2" : payload.seat;
  const targetSeat = joinedSeat === "player2" ? "player1" : null;
  if (!targetSeat || room.playerReady?.[targetSeat]) return null;
  const opponentName = room.players?.[joinedSeat]?.displayName || "Your opponent";
  return {
    type: "room-ready",
    seat: targetSeat,
    detail: room.players?.[joinedSeat]?.playerId ?? joinedSeat,
    title: "Opponent joined your Spades room",
    body: opponentName + " is in room " + room.roomCode + ". Open Spades and press Ready."
  };
}

function bidNotification(room) {
  const nextBidder = PLAYERS.find((seat) => room.game?.bids?.[seat] === null || room.game?.bids?.[seat] === undefined) ?? null;
  if (!nextBidder) return null;
  return {
    type: "bid-turn",
    seat: nextBidder,
    detail: room.handNumber,
    title: "Your Spades bid is up",
    body: "Room " + room.roomCode + ": open the game and place your bid."
  };
}

function turnNotification(room) {
  const seat = room.currentTurn;
  if (!PLAYERS.includes(seat)) return null;
  return {
    type: "play-turn",
    seat,
    detail: [room.handNumber, room.game?.currentTrick?.length ?? 0, room.game?.hands?.[seat]?.length ?? 0].join(":"),
    title: "Your turn in Spades",
    body: "Room " + room.roomCode + ": open the game and play a card."
  };
}

async function sendExpoPush(push, logger, fetchImpl) {
  if (typeof fetchImpl !== "function") return;
  try {
    const response = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(push)
    });
    if (!response.ok) {
      logger.warn?.("Expo push send failed", { status: response.status });
    }
  } catch (error) {
    logger.warn?.("Expo push send failed", { message: error?.message ?? "unknown" });
  }
}

function isExpoPushToken(token) {
  return /^ExponentPushToken\[[^\]]+\]$/.test(token) || /^ExpoPushToken\[[^\]]+\]$/.test(token);
}
