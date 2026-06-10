export function recordCompletedRoomStats(leaderboardStats, room) {
  if (room.leaderboardRecordedAt || room.gameState?.phase !== "match_complete" || !room.gameState?.winner) {
    return {
      room,
      recorded: false
    };
  }

  const winnerSeat = room.gameState.winner;
  const loserSeat = winnerSeat === "player1" ? "player2" : "player1";
  const score = room.gameState.score ?? { player1: 0, player2: 0 };
  const winnerPlayer = room.players?.[winnerSeat];
  const loserPlayer = room.players?.[loserSeat];

  if (!statKeyForPlayer(winnerPlayer) || !statKeyForPlayer(loserPlayer)) {
    return {
      room,
      recorded: false
    };
  }

  const recordedAt = new Date().toISOString();
  updatePlayerStat(leaderboardStats, winnerPlayer, {
    won: true,
    pointsFor: score[winnerSeat] ?? 0,
    pointsAgainst: score[loserSeat] ?? 0,
    updatedAt: recordedAt
  });
  updatePlayerStat(leaderboardStats, loserPlayer, {
    won: false,
    pointsFor: score[loserSeat] ?? 0,
    pointsAgainst: score[winnerSeat] ?? 0,
    updatedAt: recordedAt
  });

  return {
    room: {
      ...room,
      leaderboardRecordedAt: recordedAt
    },
    recorded: true
  };
}

export function sanitizeLeaderboardForPublic(leaderboardStats) {
  return [...leaderboardStats.values()]
    .map((stat) => ({
      displayName: stat.displayName,
      wins: stat.wins,
      losses: stat.losses,
      matchesPlayed: stat.matchesPlayed,
      pointsFor: stat.pointsFor,
      pointsAgainst: stat.pointsAgainst,
      tournamentWins: stat.tournamentWins,
      updatedAt: stat.updatedAt,
      winPercentage: winPercentage(stat)
    }))
    .sort(compareLeaderboardRows)
    .map((stat, index) => ({
      rank: index + 1,
      ...stat
    }));
}

function updatePlayerStat(leaderboardStats, player, { won, pointsFor, pointsAgainst, updatedAt }) {
  const key = statKeyForPlayer(player);
  const existing = leaderboardStats.get(key) ?? emptyPlayerStat(player);

  leaderboardStats.set(key, {
    ...existing,
    playerId: player.playerId ?? existing.playerId ?? null,
    accountId: player.accountId ?? existing.accountId ?? null,
    displayName: player.displayName ?? existing.displayName,
    wins: existing.wins + (won ? 1 : 0),
    losses: existing.losses + (won ? 0 : 1),
    matchesPlayed: existing.matchesPlayed + 1,
    pointsFor: existing.pointsFor + pointsFor,
    pointsAgainst: existing.pointsAgainst + pointsAgainst,
    tournamentWins: existing.tournamentWins ?? 0,
    updatedAt
  });
}

function emptyPlayerStat(player) {
  return {
    playerId: player.playerId ?? null,
    accountId: player.accountId ?? null,
    displayName: player.displayName ?? "Player",
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    tournamentWins: 0,
    updatedAt: null
  };
}

function statKeyForPlayer(player) {
  if (!player) return null;
  if (player.accountId) return `account:${player.accountId}`;
  if (player.playerId) return `guest:${player.playerId}`;
  return null;
}

function compareLeaderboardRows(a, b) {
  return b.wins - a.wins
    || b.winPercentage - a.winPercentage
    || b.matchesPlayed - a.matchesPlayed
    || b.pointsFor - a.pointsFor
    || a.displayName.localeCompare(b.displayName);
}

function winPercentage(stat) {
  if (!stat.matchesPlayed) return 0;
  return Math.round((stat.wins / stat.matchesPlayed) * 1000) / 10;
}
