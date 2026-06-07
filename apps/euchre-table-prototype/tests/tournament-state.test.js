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
  tournamentHasNoRestrictedFields
} from "../src/tournament-state.js";

test("creates a tournament with a selected bracket size", () => {
  const tournament = createTournament({ tournamentCode: "EUCHRE", adminKey: "HOSTKEY", bracketSize: 4 });

  assert.equal(tournament.tournamentCode, "EUCHRE");
  assert.equal(tournament.adminKey, "HOSTKEY");
  assert.equal(tournament.bracketSize, 4);
  assert.deepEqual(tournament.players, []);
  assert.equal(tournament.status, "lobby");
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
