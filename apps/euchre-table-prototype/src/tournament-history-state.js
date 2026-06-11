const DEFAULT_HISTORY_LIMIT = 50;

export function recordCompletedTournamentHistory(tournamentHistory, tournament, { finalRoom } = {}) {
  const record = buildTournamentHistoryRecord(tournament, { finalRoom });

  if (!record) {
    return {
      recorded: false,
      record: null
    };
  }

  const existing = tournamentHistory.get(record.tournamentCode);
  if (existing) {
    return {
      recorded: false,
      record: sanitizeTournamentHistoryRecord(existing)
    };
  }

  tournamentHistory.set(record.tournamentCode, record);
  return {
    recorded: true,
    record: sanitizeTournamentHistoryRecord(record)
  };
}

export function buildTournamentHistoryRecord(tournament, { finalRoom } = {}) {
  if (!tournament || tournament.status !== "complete" || !tournament.winner) {
    return null;
  }

  const champion = tournament.winner;
  const finalMatch = finalTournamentMatch(tournament);
  const runnerUp = [finalMatch?.player1, finalMatch?.player2]
    .find((player) => player?.id && player.id !== champion.id);
  const completedAt = lastResultTimestamp(tournament)
    ?? tournament.updatedAt
    ?? new Date().toISOString();
  const bracketSize = Number(tournament.bracketSize ?? 0);
  const rounds = tournament.bracket?.rounds?.length
    ?? (bracketSize > 1 ? Math.log2(bracketSize) : 0);

  const record = {
    tournamentCode: tournament.tournamentCode,
    bracketSize,
    championDisplayName: champion.displayName ?? "Champion",
    runnerUpDisplayName: runnerUp?.displayName ?? null,
    completedAt,
    createdAt: tournament.createdAt ?? null,
    matchCount: countBracketMatches(tournament),
    rounds,
    finalScore: finalScoreFromRoom(finalRoom),
    status: "complete"
  };

  if (champion.accountId) {
    record.championAccountId = champion.accountId;
  } else if (champion.playerId) {
    record.championPlayerId = champion.playerId;
  }

  return sanitizeTournamentHistoryRecord(record);
}

export function recentTournamentHistory(tournamentHistory, { limit = DEFAULT_HISTORY_LIMIT } = {}) {
  return [...tournamentHistory.values()]
    .map(sanitizeTournamentHistoryRecord)
    .filter((record) => record.status === "complete")
    .sort((a, b) => {
      const completedDiff = Date.parse(b.completedAt ?? 0) - Date.parse(a.completedAt ?? 0);
      if (completedDiff) return completedDiff;
      return String(b.tournamentCode).localeCompare(String(a.tournamentCode));
    })
    .slice(0, limit);
}

export function getTournamentHistoryRecord(tournamentHistory, tournamentCode) {
  const record = tournamentHistory.get(String(tournamentCode ?? "").toUpperCase());
  return record ? sanitizeTournamentHistoryRecord(record) : null;
}

export function sanitizeTournamentHistoryRecord(record) {
  const safe = {
    tournamentCode: String(record.tournamentCode ?? "").toUpperCase(),
    bracketSize: Number(record.bracketSize ?? 0),
    championDisplayName: String(record.championDisplayName ?? "Champion"),
    runnerUpDisplayName: record.runnerUpDisplayName ? String(record.runnerUpDisplayName) : null,
    completedAt: record.completedAt ?? null,
    createdAt: record.createdAt ?? null,
    matchCount: Number(record.matchCount ?? 0),
    rounds: Number(record.rounds ?? 0),
    finalScore: sanitizeFinalScore(record.finalScore),
    status: "complete"
  };

  if (record.championAccountId) {
    safe.championAccountId = String(record.championAccountId);
  } else if (record.championPlayerId) {
    safe.championPlayerId = String(record.championPlayerId);
  }

  return safe;
}

function finalTournamentMatch(tournament) {
  const rounds = tournament.bracket?.rounds;
  if (!Array.isArray(rounds) || !rounds.length) return null;
  return rounds[rounds.length - 1]?.matches?.[0] ?? null;
}

function countBracketMatches(tournament) {
  const rounds = tournament.bracket?.rounds;
  if (Array.isArray(rounds)) {
    return rounds.reduce((total, round) => total + (round.matches?.length ?? 0), 0);
  }

  const bracketSize = Number(tournament.bracketSize ?? 0);
  return bracketSize > 1 ? bracketSize - 1 : 0;
}

function lastResultTimestamp(tournament) {
  const resultLog = tournament.resultLog ?? [];
  if (!resultLog.length) return null;
  return resultLog[resultLog.length - 1]?.recordedAt ?? null;
}

function finalScoreFromRoom(room) {
  const score = room?.gameState?.score;
  if (!score) return null;

  return {
    player1: Number(score.player1 ?? 0),
    player2: Number(score.player2 ?? 0)
  };
}

function sanitizeFinalScore(score) {
  if (!score || typeof score !== "object") return null;

  return {
    player1: Number(score.player1 ?? 0),
    player2: Number(score.player2 ?? 0)
  };
}
