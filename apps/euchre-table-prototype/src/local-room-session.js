export const activeRoomSessionKey = "euchreRoomSeat";
export const roomSessionsKey = "euchreRoomSeatsByRoom";
export const roomSeatTokenPrefix = "euchre.room.";

export function loadSavedActiveRoom(storage = localStorage) {
  const currentSession = readJson(storage, activeRoomSessionKey);
  if (currentSession?.roomCode && currentSession?.seatToken) {
    return currentSession;
  }

  return Object.values(loadSessionMap(storage))
    .filter((candidate) => candidate?.roomCode && candidate?.seatToken)
    .sort((a, b) => Date.parse(b.updatedAt ?? 0) - Date.parse(a.updatedAt ?? 0))[0] ?? null;
}

export function clearSavedActiveRoom(storage = localStorage, roomCode) {
  const activeRoom = roomCode
    ? findSavedRoom(storage, roomCode)
    : loadSavedActiveRoom(storage);
  const normalizedRoomCode = activeRoom?.roomCode?.toUpperCase?.() ?? roomCode?.toUpperCase?.();

  if (!normalizedRoomCode) {
    storage.removeItem(activeRoomSessionKey);
    return null;
  }

  const currentSession = readJson(storage, activeRoomSessionKey);
  if (!currentSession?.roomCode || currentSession.roomCode.toUpperCase() === normalizedRoomCode) {
    storage.removeItem(activeRoomSessionKey);
  }

  storage.removeItem(roomSeatTokenKey(normalizedRoomCode));

  const sessions = loadSessionMap(storage);
  delete sessions[normalizedRoomCode];
  storage.setItem(roomSessionsKey, JSON.stringify(sessions));

  return {
    ...activeRoom,
    roomCode: normalizedRoomCode
  };
}

export function roomSeatTokenKey(roomCode) {
  return `${roomSeatTokenPrefix}${roomCode}.seatToken`;
}

function findSavedRoom(storage, roomCode) {
  const normalizedRoomCode = roomCode?.toUpperCase?.();
  if (!normalizedRoomCode) return null;

  const currentSession = readJson(storage, activeRoomSessionKey);
  if (currentSession?.roomCode?.toUpperCase?.() === normalizedRoomCode) {
    return currentSession;
  }

  const sessions = loadSessionMap(storage);
  if (sessions[normalizedRoomCode]) return sessions[normalizedRoomCode];

  const seatToken = storage.getItem(roomSeatTokenKey(normalizedRoomCode));
  return seatToken ? { roomCode: normalizedRoomCode, seatToken } : null;
}

function loadSessionMap(storage) {
  const sessions = readJson(storage, roomSessionsKey);
  return sessions && typeof sessions === "object" && !Array.isArray(sessions) ? sessions : {};
}

function readJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}
