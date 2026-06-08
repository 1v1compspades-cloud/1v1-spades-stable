import { createRoom, noRestrictedFields } from "./room-state.js";

const TOURNAMENT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TOURNAMENT_ADMIN_KEY = "Zxcvfdsaqwer1287!";
export const VALID_BRACKET_SIZES = Object.freeze([4, 8, 16, 32, 64]);

export function createTournament({
  tournamentCode = generateTournamentCode(),
  adminKey = generateAdminKey(),
  bracketSize = 4
} = {}) {
  assertBracketSize(bracketSize);

  return {
    tournamentCode,
    adminKey,
    bracketSize,
    players: [],
    status: "lobby",
    bracket: null,
    resultLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function joinTournament(tournament, { displayName }) {
  if (tournament.status !== "lobby") {
    throw tournamentError(409, "Tournament has already started");
  }

  const name = normalizeName(displayName);

  if (!name) {
    throw tournamentError(400, "Enter a player name");
  }

  if (tournament.players.some((player) => player.displayName.toLowerCase() === name.toLowerCase())) {
    throw tournamentError(409, "That player name is already in this lobby");
  }

  if (tournament.players.length >= tournament.bracketSize) {
    throw tournamentError(409, "Tournament lobby is full");
  }

  const next = {
    ...tournament,
    players: [
      ...tournament.players,
      {
        id: `p${tournament.players.length + 1}`,
        displayName: name,
        joinedAt: new Date().toISOString()
      }
    ],
    updatedAt: new Date().toISOString()
  };

  return next;
}

export function startTournament(tournament, { adminKey, createMatchRoom = defaultCreateMatchRoom } = {}) {
  verifyTournamentAdmin(tournament, adminKey);

  if (tournament.status !== "lobby") {
    throw tournamentError(409, "Tournament has already started");
  }

  return generateBracket(tournament, { createMatchRoom });
}

export function resetTournamentLobby(tournament, { adminKey }) {
  verifyTournamentAdmin(tournament, adminKey);

  if (tournament.status !== "lobby") {
    throw tournamentError(409, "Tournament has already started");
  }

  return {
    ...tournament,
    players: [],
    bracket: null,
    winner: null,
    resultLog: [],
    updatedAt: new Date().toISOString()
  };
}

export function validateTournamentBracket(tournament, { adminKey }) {
  verifyTournamentAdmin(tournament, adminKey);

  const issues = [];
  if (!tournament.bracket) {
    issues.push("Bracket has not been created");
  } else {
    const roundOne = tournament.bracket.rounds[0];
    for (const match of roundOne.matches) {
      if (!match.player1 || !match.player2) issues.push(`${match.matchId} is missing a player`);
      if (!match.roomCode) issues.push(`${match.matchId} is missing a room`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export function exportTournamentBackup(tournament, { adminKey }) {
  verifyTournamentAdmin(tournament, adminKey);

  return {
    exportedAt: new Date().toISOString(),
    tournament: sanitizeTournamentForAdmin(tournament, adminKey)
  };
}

export function generateBracket(tournament, { createMatchRoom = defaultCreateMatchRoom } = {}) {
  assertBracketSize(tournament.bracketSize);

  if (tournament.players.length !== tournament.bracketSize) {
    throw tournamentError(400, "Tournament lobby must be full before start");
  }

  const rounds = buildEmptyRounds(tournament.bracketSize);
  const firstRoundMatchCount = tournament.bracketSize / 2;

  for (let index = 0; index < firstRoundMatchCount; index += 1) {
    const player1 = tournament.players[index * 2];
    const player2 = tournament.players[index * 2 + 1];
    const room = createMatchRoom({
      tournamentCode: tournament.tournamentCode,
      round: 1,
      matchNumber: index + 1,
      player1,
      player2
    });

    rounds[0].matches[index] = {
      ...rounds[0].matches[index],
      player1,
      player2,
      roomCode: room.roomCode,
      roomLink: `./room.html?room=${room.roomCode}`,
      winner: null,
      resultSource: null,
      locked: false,
      status: "active"
    };
  }

  return {
    ...tournament,
    status: "bracket",
    bracket: {
      rounds
    },
    updatedAt: new Date().toISOString()
  };
}

export function recordMatchWinner(tournament, { round, matchId, winnerId, source = "game_complete", createMatchRoom = defaultCreateMatchRoom }) {
  if (!tournament.bracket) {
    throw tournamentError(400, "Bracket has not been created");
  }

  const roundIndex = round - 1;
  const rounds = tournament.bracket.rounds.map((roundEntry) => ({
    ...roundEntry,
    matches: roundEntry.matches.map((match) => ({ ...match }))
  }));
  const match = rounds[roundIndex]?.matches.find((candidate) => candidate.matchId === matchId);

  if (!match) {
    throw tournamentError(404, "Match not found");
  }

  const winner = [match.player1, match.player2].find((player) => player?.id === winnerId);
  if (!winner) {
    throw tournamentError(400, "Winner must be one of the match players");
  }

  if (match.winner) {
    throw tournamentError(409, "Match result is already recorded");
  }

  match.winner = winner;
  match.resultSource = source;
  match.locked = true;
  match.status = source === "admin_forfeit" ? "forfeited" : "complete";

  const nextRound = rounds[roundIndex + 1];
  if (nextRound) {
    const nextMatchIndex = Math.floor((match.matchNumber - 1) / 2);
    const target = nextRound.matches[nextMatchIndex];
    const slot = match.matchNumber % 2 === 1 ? "player1" : "player2";
    target[slot] = winner;

    if (target.player1 && target.player2 && !target.roomCode) {
      const room = createMatchRoom({
        tournamentCode: tournament.tournamentCode,
        round: target.round,
        matchNumber: target.matchNumber,
        player1: target.player1,
        player2: target.player2
      });
      target.roomCode = room.roomCode;
      target.roomLink = `./room.html?room=${room.roomCode}`;
      target.status = "active";
    } else if (target.player1 || target.player2) {
      target.status = "waiting";
    }
  }

  const finalRound = rounds[rounds.length - 1];
  const finalMatch = finalRound.matches[0];
  const status = finalMatch.winner ? "complete" : "bracket";

  return {
    ...tournament,
    status,
    bracket: { rounds },
    winner: finalMatch.winner ?? null,
    resultLog: [
      ...(tournament.resultLog ?? []),
      {
        round,
        matchId,
        winnerId,
        source,
        recordedAt: new Date().toISOString()
      }
    ],
    updatedAt: new Date().toISOString()
  };
}

export function adminRecordMatchWinner(tournament, { adminKey, round, matchId, winnerId, source, createMatchRoom = defaultCreateMatchRoom }) {
  verifyTournamentAdmin(tournament, adminKey);

  if (!["admin_forfeit", "admin_mark_winner"].includes(source)) {
    throw tournamentError(400, "Invalid admin result source");
  }

  const next = recordMatchWinner(tournament, {
    round,
    matchId,
    winnerId,
    source,
    createMatchRoom
  });

  return {
    ...next
  };
}

export function sanitizeTournamentForViewer(tournament) {
  return {
    tournamentCode: tournament.tournamentCode,
    bracketSize: tournament.bracketSize,
    players: tournament.players.map((player) => ({
      id: player.id,
      displayName: player.displayName
    })),
    openSlots: tournament.bracketSize - tournament.players.length,
    status: tournament.status,
    bracket: tournament.bracket,
    winner: tournament.winner ?? null,
    resultLog: (tournament.resultLog ?? []).map((entry) => ({
      round: entry.round,
      matchId: entry.matchId,
      winnerId: entry.winnerId,
      source: entry.source,
      recordedAt: entry.recordedAt
    }))
  };
}

export function sanitizeTournamentForAdmin(tournament, adminKey) {
  verifyTournamentAdmin(tournament, adminKey);

  return {
    ...sanitizeTournamentForViewer(tournament),
    admin: {
      verified: true,
      matchLinks: collectMatchLinks(tournament),
      canStart: tournament.status === "lobby" && tournament.players.length === tournament.bracketSize,
      canResetLobby: tournament.status === "lobby",
      bracketValidation: tournament.bracket
        ? validateTournamentBracket(tournament, { adminKey })
        : { valid: false, issues: ["Bracket has not been created"] }
    }
  };
}

export function verifyTournamentAdmin(tournament, adminKey) {
  if (!adminKey || adminKey !== tournament.adminKey) {
    throw tournamentError(403, "Invalid admin key");
  }

  return true;
}

export function tournamentHasNoRestrictedFields(tournament, restrictedTerms = []) {
  return noRestrictedFields(tournament, restrictedTerms);
}

export function generateTournamentCode() {
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += TOURNAMENT_CODE_ALPHABET[Math.floor(Math.random() * TOURNAMENT_CODE_ALPHABET.length)];
  }

  return code;
}

export function generateAdminKey() {
  return TOURNAMENT_ADMIN_KEY;
}

function collectMatchLinks(tournament) {
  if (!tournament.bracket) return [];

  return tournament.bracket.rounds.flatMap((round) => round.matches)
    .filter((match) => match.roomCode)
    .map((match) => ({
      round: match.round,
      matchId: match.matchId,
      roomCode: match.roomCode,
      roomLink: match.roomLink
    }));
}

function buildEmptyRounds(bracketSize) {
  const roundCount = Math.log2(bracketSize);
  const rounds = [];

  for (let round = 1; round <= roundCount; round += 1) {
    const matchCount = bracketSize / 2 ** round;
    rounds.push({
      round,
      name: round === roundCount ? "Final" : `Round ${round}`,
      matches: Array.from({ length: matchCount }, (_, index) => ({
        matchId: `r${round}m${index + 1}`,
        round,
        matchNumber: index + 1,
        player1: null,
        player2: null,
        roomCode: null,
        roomLink: null,
        winner: null,
        resultSource: null,
        locked: false,
        status: round === 1 ? "pending" : "waiting"
      }))
    });
  }

  return rounds;
}

function defaultCreateMatchRoom({ tournamentCode, round, matchNumber }) {
  return createRoom({
    roomCode: `${tournamentCode.slice(0, 3)}${round}${matchNumber}`
  });
}

function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
}

function assertBracketSize(bracketSize) {
  if (!VALID_BRACKET_SIZES.includes(Number(bracketSize))) {
    throw tournamentError(400, "Bracket size must be 4, 8, 16, 32, or 64");
  }
}

function tournamentError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
