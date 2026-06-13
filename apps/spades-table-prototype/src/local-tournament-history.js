export function createLocalTournamentHistoryStore({
  storage = defaultStorage(),
  namespace = "spadesPrototype"
} = {}) {
  const key = `${namespace}:tournamentHistory`;
  let memoryState = emptyState();

  function recordTournament(tournament = {}) {
    const state = loadState();
    const normalized = normalizeTournament(tournament);
    const existingIndex = state.tournaments.findIndex((entry) => entry.id === normalized.id);
    const tournaments = existingIndex >= 0
      ? state.tournaments.map((entry, index) => (index === existingIndex ? normalized : entry))
      : [...state.tournaments, normalized];
    const next = { tournaments };
    saveState(next);
    return freezeClone(normalized);
  }

  function listTournaments({ playerId } = {}) {
    return loadState().tournaments
      .filter((tournament) => !playerId || tournament.players.some((player) => player.playerId === playerId))
      .map(freezeClone);
  }

  function getSummary({ playerId } = {}) {
    const tournaments = listTournaments({ playerId });
    const playerPlacements = {};
    for (const tournament of tournaments) {
      for (const placement of tournament.placements) {
        if (playerId && placement.playerId !== playerId) continue;
        const current = playerPlacements[placement.playerId] ?? {
          playerId: placement.playerId,
          displayName: placement.displayName,
          tournamentsPlayed: 0,
          firstPlace: 0,
          topTwo: 0,
          placementTotal: 0,
          bestPlacement: null,
          lastPlayedAt: null
        };
        playerPlacements[placement.playerId] = {
          ...current,
          displayName: placement.displayName,
          tournamentsPlayed: current.tournamentsPlayed + 1,
          firstPlace: current.firstPlace + (placement.place === 1 ? 1 : 0),
          topTwo: current.topTwo + (placement.place <= 2 ? 1 : 0),
          placementTotal: current.placementTotal + placement.place,
          bestPlacement: current.bestPlacement === null
            ? placement.place
            : Math.min(current.bestPlacement, placement.place),
          lastPlayedAt: tournament.timestamp
        };
      }
    }

    return freezeClone({
      tournamentCount: tournaments.length,
      matchCount: tournaments.reduce((sum, tournament) => sum + tournament.matches.length, 0),
      players: Object.values(playerPlacements).map((player) => ({
        ...player,
        averagePlacement: player.tournamentsPlayed
          ? Number((player.placementTotal / player.tournamentsPlayed).toFixed(2))
          : 0
      })).sort((left, right) => (
        right.firstPlace - left.firstPlace ||
        left.averagePlacement - right.averagePlacement ||
        left.displayName.localeCompare(right.displayName)
      )),
      latest: tournaments.at(-1) ?? null
    });
  }

  function reset() {
    const state = emptyState();
    saveState(state);
    return freezeClone(state);
  }

  return {
    recordTournament,
    listTournaments,
    getSummary,
    reset,
    snapshot: () => freezeClone(loadState())
  };

  function loadState() {
    if (!storage) return memoryState;
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "null");
      if (!parsed || !Array.isArray(parsed.tournaments)) return emptyState();
      return {
        tournaments: parsed.tournaments
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

function normalizeTournament(tournament) {
  const matches = (tournament.matches ?? []).map(normalizeMatchResult);
  if (!matches.length) {
    throw new Error("Local tournament history requires at least one match result");
  }
  const timestamp = String(tournament.timestamp ?? new Date().toISOString());
  const id = String(tournament.id ?? `local-tournament-${timestamp}`);
  const playerStats = aggregatePlayers(matches);
  const placements = placePlayers(playerStats);

  return freezeClone({
    id,
    name: String(tournament.name ?? "Local Tournament Snapshot"),
    timestamp,
    matchGroupId: String(tournament.matchGroupId ?? id),
    matches,
    matchIds: matches.map((match) => match.id),
    players: placements.map(({ playerId, displayName }) => ({ playerId, displayName })),
    placements,
    stats: {
      matchCount: matches.length,
      playerCount: placements.length,
      players: Object.fromEntries(placements.map((placement) => [
        placement.playerId,
        {
          displayName: placement.displayName,
          gamesPlayed: placement.gamesPlayed,
          wins: placement.wins,
          losses: placement.losses,
          nilMade: placement.nilMade,
          nilFailed: placement.nilFailed,
          bags: placement.bags,
          scoreFor: placement.scoreFor,
          scoreAgainst: placement.scoreAgainst,
          scoreDiff: placement.scoreDiff
        }
      ]))
    }
  });
}

function normalizeMatchResult(result) {
  if (!result?.id) {
    throw new Error("Tournament match results require ids");
  }
  if (!result.players?.player1?.playerId || !result.players?.player2?.playerId) {
    throw new Error("Tournament match results require player ids");
  }
  return {
    id: String(result.id),
    roomCode: String(result.roomCode ?? ""),
    timestamp: String(result.timestamp ?? ""),
    winner: result.winner ?? null,
    finalScore: result.finalScore ?? { player1: 0, player2: 0 },
    bids: result.bids ?? { player1: null, player2: null },
    bags: result.bags ?? { player1: 0, player2: 0 },
    nilResults: result.nilResults ?? { player1: null, player2: null },
    players: {
      player1: normalizePlayer(result.players.player1),
      player2: normalizePlayer(result.players.player2)
    }
  };
}

function aggregatePlayers(matches) {
  const stats = new Map();
  for (const match of matches) {
    for (const seat of ["player1", "player2"]) {
      const opponentSeat = seat === "player1" ? "player2" : "player1";
      const player = match.players[seat];
      const current = stats.get(player.playerId) ?? emptyTournamentPlayer(player);
      const won = match.winner === seat;
      const nilResult = match.nilResults?.[seat] ?? null;
      stats.set(player.playerId, {
        ...current,
        displayName: player.displayName,
        gamesPlayed: current.gamesPlayed + 1,
        wins: current.wins + (won ? 1 : 0),
        losses: current.losses + (won ? 0 : 1),
        nilMade: current.nilMade + (nilResult === "made" ? 1 : 0),
        nilFailed: current.nilFailed + (nilResult === "failed" ? 1 : 0),
        bags: current.bags + (match.bags?.[seat] ?? 0),
        scoreFor: current.scoreFor + (match.finalScore?.[seat] ?? 0),
        scoreAgainst: current.scoreAgainst + (match.finalScore?.[opponentSeat] ?? 0)
      });
    }
  }
  return [...stats.values()];
}

function placePlayers(players) {
  return players
    .map((player) => ({
      ...player,
      scoreDiff: player.scoreFor - player.scoreAgainst
    }))
    .sort((left, right) => (
      right.wins - left.wins ||
      right.scoreDiff - left.scoreDiff ||
      right.scoreFor - left.scoreFor ||
      left.displayName.localeCompare(right.displayName)
    ))
    .map((player, index) => ({
      place: index + 1,
      ...player
    }));
}

function normalizePlayer(player) {
  return {
    playerId: String(player.playerId),
    displayName: String(player.displayName ?? "Player")
  };
}

function emptyTournamentPlayer(player) {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    nilMade: 0,
    nilFailed: 0,
    bags: 0,
    scoreFor: 0,
    scoreAgainst: 0
  };
}

function emptyState() {
  return {
    tournaments: []
  };
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
