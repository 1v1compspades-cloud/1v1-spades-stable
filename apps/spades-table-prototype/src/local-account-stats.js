export function createLocalAccountStatsStore({
  storage = defaultStorage(),
  namespace = "spadesPrototype"
} = {}) {
  const key = `${namespace}:accountStats`;
  let memoryState = emptyState();

  function recordMatch(result) {
    const state = loadState();
    const normalized = normalizeResult(result);
    if (state.processedIds.includes(normalized.id)) {
      return snapshot(state);
    }

    const next = {
      processedIds: [...state.processedIds, normalized.id],
      records: [...state.records, normalized],
      players: { ...state.players }
    };

    for (const seat of ["player1", "player2"]) {
      const player = normalized.players[seat];
      if (!player?.playerId) continue;
      const current = next.players[player.playerId] ?? emptyPlayerStats(player);
      const won = normalized.winner === seat;
      const nilResult = normalized.nilResults?.[seat] ?? null;
      next.players[player.playerId] = {
        ...current,
        displayName: player.displayName,
        gamesPlayed: current.gamesPlayed + 1,
        wins: current.wins + (won ? 1 : 0),
        losses: current.losses + (won ? 0 : 1),
        nilMade: current.nilMade + (nilResult === "made" ? 1 : 0),
        nilFailed: current.nilFailed + (nilResult === "failed" ? 1 : 0),
        bags: current.bags + (normalized.bags?.[seat] ?? 0),
        lastPlayedAt: normalized.timestamp
      };
    }

    saveState(next);
    return snapshot(next);
  }

  function listResults({ playerId } = {}) {
    const records = loadState().records;
    if (!playerId) return records.map(freezeClone);
    return records
      .filter((record) => Object.values(record.players).some((player) => player.playerId === playerId))
      .map(freezeClone);
  }

  function getPlayerStats(playerId) {
    const stats = loadState().players[playerId];
    return stats ? freezeClone(stats) : emptyPlayerStats({ playerId, displayName: "Player" });
  }

  function getLeaderboard({ limit = 10 } = {}) {
    return Object.values(loadState().players)
      .map((stats) => ({
        ...stats,
        winRate: stats.gamesPlayed ? Number((stats.wins / stats.gamesPlayed).toFixed(3)) : 0
      }))
      .sort((left, right) => (
        right.wins - left.wins ||
        right.gamesPlayed - left.gamesPlayed ||
        right.winRate - left.winRate ||
        left.displayName.localeCompare(right.displayName)
      ))
      .slice(0, limit)
      .map(freezeClone);
  }

  function reset() {
    const state = emptyState();
    saveState(state);
    return snapshot(state);
  }

  return {
    recordMatch,
    listResults,
    getPlayerStats,
    getLeaderboard,
    reset,
    snapshot: () => snapshot(loadState())
  };

  function loadState() {
    if (!storage) return memoryState;
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "null");
      if (!parsed || !Array.isArray(parsed.records) || !parsed.players) return emptyState();
      return {
        processedIds: Array.isArray(parsed.processedIds) ? parsed.processedIds.map(String) : [],
        records: parsed.records,
        players: parsed.players
      };
    } catch {
      return emptyState();
    }
  }

  function saveState(state) {
    memoryState = state;
    if (storage) {
      storage.setItem(key, JSON.stringify(state));
    }
  }
}

function normalizeResult(result) {
  if (!result?.id) {
    throw new Error("Local account stats require a match result id");
  }
  if (!result.players?.player1?.playerId || !result.players?.player2?.playerId) {
    throw new Error("Local account stats require player ids for both seats");
  }

  return freezeClone({
    id: String(result.id),
    roomCode: String(result.roomCode ?? ""),
    timestamp: String(result.timestamp ?? new Date().toISOString()),
    winner: result.winner ?? null,
    finalScore: result.finalScore ?? { player1: 0, player2: 0 },
    bids: result.bids ?? { player1: null, player2: null },
    bags: result.bags ?? { player1: 0, player2: 0 },
    nilResults: result.nilResults ?? { player1: null, player2: null },
    players: {
      player1: normalizePlayer(result.players.player1),
      player2: normalizePlayer(result.players.player2)
    }
  });
}

function normalizePlayer(player) {
  return {
    playerId: String(player.playerId),
    displayName: String(player.displayName ?? "Player")
  };
}

function emptyPlayerStats({ playerId, displayName }) {
  return {
    playerId: String(playerId ?? ""),
    displayName: String(displayName ?? "Player"),
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    nilMade: 0,
    nilFailed: 0,
    bags: 0,
    lastPlayedAt: null
  };
}

function emptyState() {
  return {
    processedIds: [],
    records: [],
    players: {}
  };
}

function snapshot(state) {
  return freezeClone({
    records: state.records,
    players: state.players,
    leaderboard: Object.values(state.players).map((stats) => ({
      ...stats,
      winRate: stats.gamesPlayed ? Number((stats.wins / stats.gamesPlayed).toFixed(3)) : 0
    }))
  });
}

function freezeClone(value) {
  return deepFreeze(JSON.parse(JSON.stringify(value)));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function defaultStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}
