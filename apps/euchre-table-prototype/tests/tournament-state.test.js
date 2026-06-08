import test from "node:test";
import assert from "node:assert/strict";
import {
  adminRecordMatchWinner,
  createTournament,
  exportTournamentBackup,
  joinTournament,
  recordMatchWinner,
  resetTournamentLobby,
  sanitizeTournamentForAdmin,
  sanitizeTournamentForViewer,
  startTournament,
  tournamentHasNoRestrictedFields,
  TOURNAMENT_ADMIN_KEY,
  VALID_BRACKET_SIZES,
  validateTournamentBracket,
  verifyTournamentAdmin
} from "../src/tournament-state.js";

test("creates a tournament with a selected bracket size", () => {
  const tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });

  assert.equal(tournament.tournamentCode, "EUCHRE");
  assert.equal(tournament.adminKey, "HOSTKEY");
  assert.equal(tournament.bracketSize, 4);
  assert.deepEqual(tournament.players, []);
  assert.equal(tournament.status, "lobby");
});

test("default admin key accepts the configured key and rejects old keys", () => {
  const tournament = createTournament({ tournamentCode: "EUCHRE", bracketSize: 4 });

  assert.equal(tournament.adminKey, TOURNAMENT_ADMIN_KEY);
  assert.equal(verifyTournamentAdmin(tournament, "Zxcvfdsaqwer1287!"), true);
  assert.throws(() => verifyTournamentAdmin(tournament, "MEHDI"), /Invalid admin key/);
  assert.throws(() => verifyTournamentAdmin(tournament, "HOSTKEY"), /Invalid admin key/);
  assert.equal(JSON.stringify(sanitizeTournamentForViewer(tournament)).includes(TOURNAMENT_ADMIN_KEY), false);
});

test("supported bracket sizes create first-round matches", () => {
  assert.deepEqual(VALID_BRACKET_SIZES, [4, 8, 16, 32, 64]);

  for (const bracketSize of VALID_BRACKET_SIZES) {
    const createdRooms = [];
    let tournament = fillTournament(bracketSize);
    tournament = startTournament(tournament, {
      adminKey: TOURNAMENT_ADMIN_KEY,
      createMatchRoom: createMatchRoomRecorder(createdRooms)
    });

    assert.equal(tournament.bracketSize, bracketSize);
    assert.equal(tournament.bracket.rounds.length, Math.log2(bracketSize));
    assert.equal(tournament.bracket.rounds[0].matches.length, bracketSize / 2);
    assert.equal(createdRooms.length, bracketSize / 2);
    assert.equal(tournament.bracket.rounds[0].matches.every((match) => match.status === "active"), true);
  }
});

test("invalid bracket size is rejected", () => {
  for (const bracketSize of [0, 2, 6, 12, 24, 128]) {
    assert.throws(() => createTournament({ tournamentCode: "EUCHRE", bracketSize }), /Bracket size must be 4, 8, 16, 32, or 64/);
  }
});

test("player response never includes admin key", () => {
  const tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  const view = sanitizeTournamentForViewer(tournament);

  assert.equal("adminKey" in view, false);
  assert.equal(JSON.stringify(view).includes("HOSTKEY"), false);
});

test("invalid admin key is rejected and valid key unlocks admin view", () => {
  const tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });

  assert.throws(() => sanitizeTournamentForAdmin(tournament, "WRONG"), /Invalid admin key/);

  const adminView = sanitizeTournamentForAdmin(tournament, "HOSTKEY");
  assert.equal(adminView.admin.verified, true);
  assert.equal(JSON.stringify(adminView).includes("HOSTKEY"), false);
});

test("admin-only tournament actions require the admin key", () => {
  let tournament = fillTournament(4);
  const createMatchRoom = createMatchRoomRecorder([]);

  assert.throws(() => startTournament(tournament, { adminKey: "WRONG", createMatchRoom }), /Invalid admin key/);
  assert.throws(() => resetTournamentLobby(tournament, { adminKey: "WRONG" }), /Invalid admin key/);
  assert.throws(() => validateTournamentBracket(tournament, { adminKey: "WRONG" }), /Invalid admin key/);
  assert.throws(() => exportTournamentBackup(tournament, { adminKey: "WRONG" }), /Invalid admin key/);

  tournament = startTournament(tournament, { adminKey: TOURNAMENT_ADMIN_KEY, createMatchRoom });
  const winner = tournament.bracket.rounds[0].matches[0].player1;

  assert.throws(() => adminRecordMatchWinner(tournament, {
    adminKey: "WRONG",
    round: 1,
    matchId: "r1m1",
    winnerId: winner.id,
    source: "admin_mark_winner",
    createMatchRoom
  }), /Invalid admin key/);
});

test("joins tournament lobby and prevents duplicate names", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", bracketSize: 4 });
  tournament = joinTournament(tournament, { displayName: "Mehdi" });

  assert.equal(tournament.players.length, 1);
  assert.equal(tournament.players[0].displayName, "Mehdi");
  assert.throws(() => joinTournament(tournament, { displayName: " mehdi " }), /already/);
});

test("prevents overfilled tournament bracket", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", bracketSize: 4 });
  tournament = joinTournament(tournament, { displayName: "A" });
  tournament = joinTournament(tournament, { displayName: "B" });
  tournament = joinTournament(tournament, { displayName: "C" });
  tournament = joinTournament(tournament, { displayName: "D" });

  assert.throws(() => joinTournament(tournament, { displayName: "E" }), /full/);
});

test("join errors stay clear after tournament starts", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  for (const displayName of ["A", "B", "C", "D"]) {
    tournament = joinTournament(tournament, { displayName });
  }
  tournament = startTournament(tournament, {
    adminKey: "HOSTKEY",
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}${matchNumber}` })
  });

  assert.throws(() => joinTournament(tournament, { displayName: "E" }), (error) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /already started/);
    return true;
  });
});

test("generates a 4-player single-elimination bracket and round 1 match rooms", () => {
  const roomCodes = [];
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  const createMatchRoom = ({ round, matchNumber }) => {
    const roomCode = `ROOM${round}${matchNumber}`;
    roomCodes.push(roomCode);
    return { roomCode };
  };

  tournament = joinTournament(tournament, { displayName: "A" });
  tournament = joinTournament(tournament, { displayName: "B" });
  tournament = joinTournament(tournament, { displayName: "C" });
  tournament = joinTournament(tournament, { displayName: "D" });

  assert.equal(tournament.status, "lobby");
  assert.throws(() => startTournament(tournament, { adminKey: "WRONG", createMatchRoom }), /Invalid admin key/);
  tournament = startTournament(tournament, { adminKey: "HOSTKEY", createMatchRoom });

  assert.equal(tournament.status, "bracket");
  assert.equal(tournament.bracket.rounds.length, 2);
  assert.equal(tournament.bracket.rounds[0].matches.length, 2);
  assert.deepEqual(roomCodes, ["ROOM11", "ROOM12"]);
  assert.equal(tournament.bracket.rounds[0].matches[0].roomCode, "ROOM11");
  assert.equal(tournament.bracket.rounds[0].matches[0].status, "active");
  assert.match(tournament.bracket.rounds[0].matches[0].roomLink, /ROOM11/);
});

test("records match winner and advances winner to final", () => {
  const createdRooms = [];
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  const createMatchRoom = ({ round, matchNumber }) => {
    const roomCode = `ROOM${round}${matchNumber}`;
    createdRooms.push(roomCode);
    return { roomCode };
  };

  for (const displayName of ["A", "B", "C", "D"]) {
    tournament = joinTournament(tournament, { displayName });
  }
  tournament = startTournament(tournament, { adminKey: "HOSTKEY", createMatchRoom });

  const firstWinner = tournament.bracket.rounds[0].matches[0].player1;
  const secondWinner = tournament.bracket.rounds[0].matches[1].player2;
  tournament = recordMatchWinner(tournament, {
    round: 1,
    matchId: "r1m1",
    winnerId: firstWinner.id,
    createMatchRoom
  });

  assert.equal(tournament.bracket.rounds[1].matches[0].player1.displayName, firstWinner.displayName);
  assert.equal(tournament.bracket.rounds[1].matches[0].status, "waiting");

  tournament = recordMatchWinner(tournament, {
    round: 1,
    matchId: "r1m2",
    winnerId: secondWinner.id,
    createMatchRoom
  });

  assert.equal(tournament.bracket.rounds[1].matches[0].player2.displayName, secondWinner.displayName);
  assert.equal(tournament.bracket.rounds[1].matches[0].roomCode, "ROOM21");
  assert.equal(tournament.bracket.rounds[1].matches[0].status, "active");
  assert.deepEqual(createdRooms, ["ROOM11", "ROOM12", "ROOM21"]);
  assert.equal(tournament.resultLog[1].source, "game_complete");
});

test("champion appears after final match completes", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  for (const displayName of ["A", "B", "C", "D"]) {
    tournament = joinTournament(tournament, { displayName });
  }
  tournament = startTournament(tournament, {
    adminKey: "HOSTKEY",
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}${matchNumber}` })
  });
  const firstWinner = tournament.bracket.rounds[0].matches[0].player1;
  const secondWinner = tournament.bracket.rounds[0].matches[1].player2;
  tournament = recordMatchWinner(tournament, { round: 1, matchId: "r1m1", winnerId: firstWinner.id });
  tournament = recordMatchWinner(tournament, { round: 1, matchId: "r1m2", winnerId: secondWinner.id });
  tournament = recordMatchWinner(tournament, { round: 2, matchId: "r2m1", winnerId: firstWinner.id });

  assert.equal(tournament.status, "complete");
  assert.equal(tournament.winner.displayName, "A");
  assert.equal(sanitizeTournamentForViewer(tournament).winner.displayName, "A");
});

test("64-player bracket advances through champion", () => {
  const createdRooms = [];
  let tournament = fillTournament(64);
  const createMatchRoom = createMatchRoomRecorder(createdRooms);

  tournament = startTournament(tournament, {
    adminKey: TOURNAMENT_ADMIN_KEY,
    createMatchRoom
  });

  assert.equal(tournament.bracket.rounds.length, 6);
  assert.deepEqual(tournament.bracket.rounds.map((round) => round.matches.length), [32, 16, 8, 4, 2, 1]);
  assert.equal(tournament.bracket.rounds[0].matches.length, 32);
  assert.equal(createdRooms.length, 32);
  assert.equal(sanitizeTournamentForAdmin(tournament, TOURNAMENT_ADMIN_KEY).admin.bracketValidation.valid, true);

  tournament = completeBracketByPlayerOne(tournament, createMatchRoom);

  assert.equal(tournament.status, "complete");
  assert.equal(tournament.winner.displayName, "Player 1");
  assert.equal(tournament.resultLog.length, 63);
  assert.equal(createdRooms.length, 63);
  assert.equal(sanitizeTournamentForViewer(tournament).winner.displayName, "Player 1");
  assert.equal("admin" in sanitizeTournamentForViewer(tournament), false);
});

test("player cannot start tournament and admin can reset lobby before start", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  tournament = joinTournament(tournament, { displayName: "A" });
  tournament = joinTournament(tournament, { displayName: "B" });

  assert.throws(() => startTournament(tournament, { adminKey: null }), /Invalid admin key/);

  tournament = resetTournamentLobby(tournament, { adminKey: "HOSTKEY" });
  assert.equal(tournament.players.length, 0);
  assert.equal(tournament.status, "lobby");
});

test("admin can view match links after start and export backup", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  for (const displayName of ["A", "B", "C", "D"]) {
    tournament = joinTournament(tournament, { displayName });
  }
  tournament = startTournament(tournament, {
    adminKey: "HOSTKEY",
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}${matchNumber}` })
  });

  const adminView = sanitizeTournamentForAdmin(tournament, "HOSTKEY");
  const backup = exportTournamentBackup(tournament, { adminKey: "HOSTKEY" });

  assert.equal(adminView.admin.matchLinks.length, 2);
  assert.equal(adminView.admin.bracketValidation.valid, true);
  assert.equal(backup.tournament.admin.matchLinks.length, 2);
});

test("admin can forfeit or manually mark winner and double advancement is prevented", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  for (const displayName of ["A", "B", "C", "D"]) {
    tournament = joinTournament(tournament, { displayName });
  }
  tournament = startTournament(tournament, {
    adminKey: "HOSTKEY",
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}${matchNumber}` })
  });

  const winner = tournament.bracket.rounds[0].matches[0].player1;
  tournament = adminRecordMatchWinner(tournament, {
    adminKey: "HOSTKEY",
    round: 1,
    matchId: "r1m1",
    winnerId: winner.id,
    source: "admin_forfeit",
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}${matchNumber}` })
  });

  assert.equal(tournament.resultLog[0].source, "admin_forfeit");
  assert.equal(tournament.bracket.rounds[0].matches[0].status, "forfeited");
  assert.throws(() => adminRecordMatchWinner(tournament, {
    adminKey: "HOSTKEY",
    round: 1,
    matchId: "r1m1",
    winnerId: winner.id,
    source: "admin_mark_winner"
  }), /already recorded/);
});

test("invalid admin cannot mark winner", () => {
  let tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });
  for (const displayName of ["A", "B", "C", "D"]) {
    tournament = joinTournament(tournament, { displayName });
  }
  tournament = startTournament(tournament, {
    adminKey: "HOSTKEY",
    createMatchRoom: ({ round, matchNumber }) => ({ roomCode: `ROOM${round}${matchNumber}` })
  });
  const winner = tournament.bracket.rounds[0].matches[0].player1;

  assert.throws(() => adminRecordMatchWinner(tournament, {
    adminKey: "WRONG",
    round: 1,
    matchId: "r1m1",
    winnerId: winner.id,
    source: "admin_mark_winner"
  }), /Invalid admin key/);
});

test("spectator-safe tournament view exposes bracket status only", () => {
  const tournament = createTournament({ tournamentCode: "EUCHRE", bracketSize: 4 });
  const view = sanitizeTournamentForViewer(tournament);

  assert.equal(view.tournamentCode, "EUCHRE");
  assert.equal(view.openSlots, 4);
  assert.equal(view.bracket, null);
});

test("tournament state has no restricted commerce fields", () => {
  const restricted = [
    ["m", "oney"].join(""),
    ["dep", "osit"].join(""),
    ["wal", "let"].join(""),
    ["pr", "ize"].join("")
  ];
  const tournament = createTournament({ tournamentCode: "EUCHRE", bracketSize: 4 });

  assert.equal(tournamentHasNoRestrictedFields(tournament, restricted), true);
});

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

function createMatchRoomRecorder(createdRooms) {
  return ({ round, matchNumber }) => {
    const roomCode = `ROOM${round}-${matchNumber}`;
    createdRooms.push(roomCode);
    return { roomCode };
  };
}

function completeBracketByPlayerOne(tournament, createMatchRoom) {
  let nextTournament = tournament;

  for (const round of tournament.bracket.rounds) {
    const roundMatches = [...nextTournament.bracket.rounds[round.round - 1].matches];
    for (const match of roundMatches) {
      nextTournament = adminRecordMatchWinner(nextTournament, {
        adminKey: TOURNAMENT_ADMIN_KEY,
        round: match.round,
        matchId: match.matchId,
        winnerId: match.player1.id,
        source: "admin_mark_winner",
        createMatchRoom
      });
    }
  }

  return nextTournament;
}
