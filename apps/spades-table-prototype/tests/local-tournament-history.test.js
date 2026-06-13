import test from "node:test";
import assert from "node:assert/strict";
import { createLocalTournamentHistoryStore } from "../src/local-tournament-history.js";

test("local tournament history records grouped match results with placements", () => {
  const store = createLocalTournamentHistoryStore({ storage: createMemoryStorage(), namespace: "tournaments" });

  const tournament = store.recordTournament({
    id: "tournament-1",
    name: "Saturday Local",
    timestamp: "2026-06-13T15:00:00.000Z",
    matches: [
      matchResult({ id: "match-1", winner: "player1", score: { player1: 100, player2: 50 } }),
      matchResult({
        id: "match-2",
        winner: "player1",
        score: { player1: 80, player2: 70 },
        players: {
          player1: { playerId: "device-3", displayName: "East" },
          player2: { playerId: "device-1", displayName: "North" }
        }
      })
    ]
  });

  assert.equal(tournament.name, "Saturday Local");
  assert.deepEqual(tournament.matchIds, ["match-1", "match-2"]);
  assert.equal(tournament.stats.matchCount, 2);
  assert.equal(tournament.stats.playerCount, 3);
  assert.deepEqual(tournament.placements.map((row) => row.playerId), ["device-1", "device-3", "device-2"]);
  assert.deepEqual(tournament.placements.map((row) => row.place), [1, 2, 3]);
  assert.equal(tournament.stats.players["device-1"].gamesPlayed, 2);
  assert.equal(tournament.stats.players["device-1"].scoreDiff, 40);
});

test("local tournament summary aggregates player placement history", () => {
  const store = createLocalTournamentHistoryStore({ storage: createMemoryStorage(), namespace: "summary" });
  store.recordTournament({
    id: "tournament-1",
    timestamp: "2026-06-13T15:00:00.000Z",
    matches: [
      matchResult({ id: "match-1", winner: "player1" })
    ]
  });
  store.recordTournament({
    id: "tournament-2",
    timestamp: "2026-06-13T16:00:00.000Z",
    matches: [
      matchResult({ id: "match-2", winner: "player2" })
    ]
  });

  const summary = store.getSummary();
  const north = summary.players.find((player) => player.playerId === "device-1");
  const south = summary.players.find((player) => player.playerId === "device-2");

  assert.equal(summary.tournamentCount, 2);
  assert.equal(summary.matchCount, 2);
  assert.equal(summary.latest.id, "tournament-2");
  assert.equal(north.tournamentsPlayed, 2);
  assert.equal(north.firstPlace, 1);
  assert.equal(north.bestPlacement, 1);
  assert.equal(north.averagePlacement, 1.5);
  assert.equal(south.firstPlace, 1);
});

test("local tournament history filters by player and resets local storage", () => {
  const store = createLocalTournamentHistoryStore({ storage: createMemoryStorage(), namespace: "filter" });
  store.recordTournament({
    id: "tournament-1",
    matches: [matchResult({ id: "match-1" })]
  });
  store.recordTournament({
    id: "tournament-2",
    matches: [matchResult({
      id: "match-2",
      players: {
        player1: { playerId: "device-3", displayName: "East" },
        player2: { playerId: "device-4", displayName: "West" }
      }
    })]
  });

  assert.deepEqual(store.listTournaments({ playerId: "device-1" }).map((entry) => entry.id), ["tournament-1"]);
  assert.deepEqual(store.getSummary({ playerId: "device-4" }).players.map((entry) => entry.playerId), ["device-4"]);

  const reset = store.reset();
  assert.deepEqual(reset.tournaments, []);
  assert.equal(store.getSummary().tournamentCount, 0);
});

function matchResult({ id, winner = "player1", score = { player1: 100, player2: 50 }, players } = {}) {
  return {
    id,
    roomCode: "SPADES",
    timestamp: "2026-06-13T12:00:00.000Z",
    winner,
    finalScore: score,
    bids: { player1: 4, player2: 3 },
    bags: { player1: 1, player2: 2 },
    nilResults: { player1: null, player2: "failed" },
    players: players ?? {
      player1: { playerId: "device-1", displayName: "North" },
      player2: { playerId: "device-2", displayName: "South" }
    }
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
