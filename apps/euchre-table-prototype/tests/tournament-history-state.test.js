import test from "node:test";
import assert from "node:assert/strict";
import {
  adminRecordMatchWinner,
  createTournament,
  joinTournament,
  startTournament,
  TOURNAMENT_ADMIN_KEY
} from "../src/tournament-state.js";
import {
  buildTournamentHistoryRecord,
  recentTournamentHistory,
  recordCompletedTournamentHistory,
  sanitizeTournamentHistoryRecord
} from "../src/tournament-history-state.js";

test("completed tournament creates a public history record", () => {
  const history = new Map();
  const tournament = completeTournament(4);
  const result = recordCompletedTournamentHistory(history, tournament, {
    finalRoom: {
      gameState: {
        score: {
          player1: 10,
          player2: 6
        }
      }
    }
  });

  assert.equal(result.recorded, true);
  assert.equal(history.size, 1);
  assert.equal(result.record.tournamentCode, tournament.tournamentCode);
  assert.equal(result.record.bracketSize, 4);
  assert.equal(result.record.championDisplayName, "Player 1");
  assert.equal(result.record.runnerUpDisplayName, "Player 3");
  assert.equal(result.record.matchCount, 3);
  assert.equal(result.record.rounds, 2);
  assert.deepEqual(result.record.finalScore, { player1: 10, player2: 6 });
  assert.equal(result.record.status, "complete");
});

test("completed tournament history is idempotent", () => {
  const history = new Map();
  const tournament = completeTournament(4);

  const first = recordCompletedTournamentHistory(history, tournament);
  const second = recordCompletedTournamentHistory(history, tournament);

  assert.equal(first.recorded, true);
  assert.equal(second.recorded, false);
  assert.equal(history.size, 1);
  assert.deepEqual(second.record, first.record);
});

test("incomplete tournaments do not create history records", () => {
  const history = new Map();
  const tournament = fillTournament(4);

  const result = recordCompletedTournamentHistory(history, tournament);

  assert.equal(result.recorded, false);
  assert.equal(result.record, null);
  assert.deepEqual(recentTournamentHistory(history), []);
});

test("64-player tournament history uses six rounds and sixty-three matches", () => {
  const tournament = completeTournament(64);
  const record = buildTournamentHistoryRecord(tournament);

  assert.equal(record.bracketSize, 64);
  assert.equal(record.rounds, 6);
  assert.equal(record.matchCount, 63);
  assert.equal(record.championDisplayName, "Player 1");
});

test("guest champion stores championPlayerId when available", () => {
  const tournament = completeTournament(4);
  const record = buildTournamentHistoryRecord({
    ...tournament,
    winner: {
      ...tournament.winner,
      playerId: "guest-champion"
    }
  });

  assert.equal(record.championPlayerId, "guest-champion");
  assert.equal("championAccountId" in record, false);
});

test("account champion stores championAccountId when available", () => {
  const tournament = completeTournament(4);
  const record = buildTournamentHistoryRecord({
    ...tournament,
    winner: {
      ...tournament.winner,
      accountId: "account-champion",
      playerId: "guest-should-not-win"
    }
  });

  assert.equal(record.championAccountId, "account-champion");
  assert.equal("championPlayerId" in record, false);
});

test("recent tournament history sorts newest first", () => {
  const history = new Map([
    ["OLDONE", sanitizeTournamentHistoryRecord({
      tournamentCode: "OLDONE",
      bracketSize: 4,
      championDisplayName: "Old Champion",
      completedAt: "2026-06-10T10:00:00.000Z",
      createdAt: "2026-06-10T09:00:00.000Z",
      matchCount: 3,
      rounds: 2,
      status: "complete"
    })],
    ["NEWONE", sanitizeTournamentHistoryRecord({
      tournamentCode: "NEWONE",
      bracketSize: 8,
      championDisplayName: "New Champion",
      completedAt: "2026-06-10T11:00:00.000Z",
      createdAt: "2026-06-10T09:30:00.000Z",
      matchCount: 7,
      rounds: 3,
      status: "complete"
    })]
  ]);

  assert.deepEqual(recentTournamentHistory(history).map((record) => record.tournamentCode), ["NEWONE", "OLDONE"]);
});

test("public history sanitization removes private tournament data", () => {
  const record = sanitizeTournamentHistoryRecord({
    tournamentCode: "SAFE01",
    bracketSize: 4,
    championDisplayName: "Safe Champion",
    championAccountId: "account-safe",
    completedAt: "2026-06-10T10:00:00.000Z",
    createdAt: "2026-06-10T09:00:00.000Z",
    matchCount: 3,
    rounds: 2,
    finalScore: { player1: 10, player2: 8 },
    status: "complete",
    adminKey: "private-admin-key",
    seatToken: "private-seat-token",
    hiddenHands: { player1: [] }
  });

  const publicJson = JSON.stringify(record);
  assert.doesNotMatch(publicJson, /private-admin-key/);
  assert.doesNotMatch(publicJson, /private-seat-token/);
  assert.doesNotMatch(publicJson, /hiddenHands/);
  assert.equal(record.championAccountId, "account-safe");
});

function completeTournament(bracketSize) {
  let tournament = fillTournament(bracketSize);
  tournament = startTournament(tournament, {
    adminKey: TOURNAMENT_ADMIN_KEY,
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}-${matchNumber}` })
  });

  for (const round of tournament.bracket.rounds) {
    const matches = [...tournament.bracket.rounds[round.round - 1].matches];
    for (const match of matches) {
      tournament = adminRecordMatchWinner(tournament, {
        adminKey: TOURNAMENT_ADMIN_KEY,
        round: match.round,
        matchId: match.matchId,
        winnerId: match.player1.id,
        source: "admin_mark_winner",
        createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}-${matchNumber}` })
      });
    }
  }

  return tournament;
}

function fillTournament(bracketSize) {
  let tournament = createTournament({
    tournamentCode: `E${bracketSize}`,
    bracketSize
  });

  for (let index = 1; index <= bracketSize; index += 1) {
    tournament = joinTournament(tournament, { displayName: `Player ${index}` });
  }

  return tournament;
}
