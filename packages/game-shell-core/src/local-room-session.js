export function createLocalRoomSessionStorage({ namespace = "game" } = {}) {
  const prefix = normalizeNamespace(namespace);
  const activeRoomSessionKey = `${prefix}RoomSeat`;
  const roomSessionsKey = `${prefix}RoomSeatsByRoom`;
  const roomSeatTokenPrefix = `${prefix}.room.`;

  function saveActiveRoomSession({
    roomCode,
    seatToken,
    playerId = null,
    seat = null,
    updatedAt = new Date().toISOString()
  } = {}, storage = localStorage) {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const normalizedSeatToken = normalizeSeatToken(seatToken);

    if (!normalizedRoomCode || !normalizedSeatToken) {
      throw new Error("Active room session requires roomCode and seatToken");
    }

    const session = {
      roomCode: normalizedRoomCode,
      seatToken: normalizedSeatToken,
      playerId: normalizeOptionalString(playerId),
      seat: normalizeOptionalString(seat),
      updatedAt
    };
    const sessions = loadSessionMap(storage);

    sessions[normalizedRoomCode] = session;
    storage.setItem(activeRoomSessionKey, JSON.stringify(session));
    storage.setItem(roomSessionsKey, JSON.stringify(sessions));
    storage.setItem(roomSeatTokenKey(normalizedRoomCode), normalizedSeatToken);

    return session;
  }

  function loadSavedActiveRoom(storage = localStorage) {
    const currentSession = normalizeSession(readJson(storage, activeRoomSessionKey));
    if (currentSession) return currentSession;

    return Object.values(loadSessionMap(storage))
      .map(normalizeSession)
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.updatedAt ?? 0) - Date.parse(left.updatedAt ?? 0))[0] ?? null;
  }

  function loadSavedRoomSession(roomCode, storage = localStorage) {
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!normalizedRoomCode) return null;

    const active = normalizeSession(readJson(storage, activeRoomSessionKey));
    if (active?.roomCode === normalizedRoomCode) return active;

    const sessions = loadSessionMap(storage);
    const saved = normalizeSession(sessions[normalizedRoomCode]);
    if (saved) return saved;

    const seatToken = storage.getItem(roomSeatTokenKey(normalizedRoomCode));
    return seatToken ? {
      roomCode: normalizedRoomCode,
      seatToken,
      playerId: null,
      seat: null,
      updatedAt: null
    } : null;
  }

  function clearSavedActiveRoom(storage = localStorage, roomCode) {
    const activeRoom = roomCode
      ? loadSavedRoomSession(roomCode, storage)
      : loadSavedActiveRoom(storage);
    const normalizedRoomCode = activeRoom?.roomCode ?? normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      storage.removeItem(activeRoomSessionKey);
      return null;
    }

    const currentSession = normalizeSession(readJson(storage, activeRoomSessionKey));
    if (!currentSession?.roomCode || currentSession.roomCode === normalizedRoomCode) {
      storage.removeItem(activeRoomSessionKey);
    }

    storage.removeItem(roomSeatTokenKey(normalizedRoomCode));

    const sessions = loadSessionMap(storage);
    delete sessions[normalizedRoomCode];
    storage.setItem(roomSessionsKey, JSON.stringify(sessions));

    return activeRoom ? {
      ...activeRoom,
      roomCode: normalizedRoomCode
    } : {
      roomCode: normalizedRoomCode,
      seatToken: null,
      playerId: null,
      seat: null,
      updatedAt: null
    };
  }

  function roomSeatTokenKey(roomCode) {
    return `${roomSeatTokenPrefix}${normalizeRoomCode(roomCode)}.seatToken`;
  }

  function loadSessionMap(storage) {
    const sessions = readJson(storage, roomSessionsKey);
    return sessions && typeof sessions === "object" && !Array.isArray(sessions) ? sessions : {};
  }

  function normalizeSession(session) {
    const roomCode = normalizeRoomCode(session?.roomCode);
    const seatToken = normalizeSeatToken(session?.seatToken);
    if (!roomCode || !seatToken) return null;

    return {
      roomCode,
      seatToken,
      playerId: normalizeOptionalString(session.playerId),
      seat: normalizeOptionalString(session.seat),
      updatedAt: session.updatedAt ?? null
    };
  }

  return {
    activeRoomSessionKey,
    roomSessionsKey,
    roomSeatTokenPrefix,
    saveActiveRoomSession,
    loadSavedActiveRoom,
    loadSavedRoomSession,
    clearSavedActiveRoom,
    roomSeatTokenKey
  };
}

export const defaultRoomSessionStorage = createLocalRoomSessionStorage();

export const {
  activeRoomSessionKey,
  roomSessionsKey,
  roomSeatTokenPrefix,
  saveActiveRoomSession,
  loadSavedActiveRoom,
  loadSavedRoomSession,
  clearSavedActiveRoom,
  roomSeatTokenKey
} = defaultRoomSessionStorage;

function normalizeNamespace(namespace) {
  return String(namespace ?? "game").trim() || "game";
}

function normalizeRoomCode(roomCode) {
  const value = String(roomCode ?? "").trim().toUpperCase();
  return value || null;
}

function normalizeSeatToken(seatToken) {
  const value = String(seatToken ?? "").trim();
  return value || null;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}
