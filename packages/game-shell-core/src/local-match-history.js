export function createInMemoryMatchHistory({
  isComplete = (room) => Boolean(room?.winner),
  summarize = defaultSummarizeMatch
} = {}) {
  const entries = [];

  return {
    record(room, options = {}) {
      if (!isComplete(room)) {
        throw new Error("Match history can only record completed matches");
      }

      const entry = deepFreeze(deepClone(summarize(room, {
        timestamp: options.timestamp ?? new Date().toISOString(),
        ...options
      })));

      entries.push(entry);
      return entry;
    },
    list() {
      return entries.map((entry) => deepFreeze(deepClone(entry)));
    }
  };
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function defaultSummarizeMatch(room, { timestamp }) {
  return {
    id: `${room.roomCode}-${timestamp}`,
    roomCode: room.roomCode,
    timestamp,
    winner: room.winner ?? null
  };
}
