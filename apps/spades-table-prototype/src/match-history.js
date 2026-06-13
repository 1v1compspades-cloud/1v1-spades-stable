import { sanitizeRoomForViewer } from "./room-state.js";

export function createInMemoryMatchHistory() {
  const entries = [];

  return {
    record(room, { timestamp = new Date().toISOString() } = {}) {
      if (room.phase !== "match_complete") {
        throw new Error("Match history can only record completed matches");
      }

      const status = sanitizeRoomForViewer(room, {});
      const summary = status.handSummary;
      const entry = deepFreeze(deepClone({
        id: `${room.roomCode}-${room.handNumber}-${timestamp}`,
        roomCode: room.roomCode,
        timestamp,
        winner: status.winner,
        finalScore: status.score,
        bids: status.bids,
        bags: status.bags,
        nilResults: {
          player1: summary?.players.player1.nilResult ?? null,
          player2: summary?.players.player2.nilResult ?? null
        }
      }));

      entries.push(entry);
      return entry;
    },
    list() {
      return entries.map((entry) => deepFreeze(deepClone(entry)));
    }
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
