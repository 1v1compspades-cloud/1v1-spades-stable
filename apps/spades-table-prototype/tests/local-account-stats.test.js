import test from "node:test";
import assert from "node:assert/strict";
import { createLocalAccountStatsStore } from "../src/local-account-stats.js";

test("local account stats records match results keyed by player id", () => {
  const store = createLocalAccountStatsStore({ storage: createMemoryStorage(), namespace: "stats" });

  store.recordMatch(matchResult({
    id: "match-1",
    winner: "player1",
    nilResults: { player1: "made", player2: "failed" },
    bags: { player1: 2, player2: 5 }
  }));
  store.recordMatch(matchResult({
    id: "match-2",
    winner: "player2",
    nilResults: { player1: null, player2: "made" },
    bags: { player1: 3, player2: 1 }
  }));

  assert.deepEqual(store.getPlayerStats("device-1"), {
    playerId: "device-1",
    displayName: "North",
    gamesPlayed: 2,
    wins: 1,
    losses: 1,
    nilMade: 1,
    nilFailed: 0,
    bags: 5,
    lastPlayedAt: "2026-06-13T12:00:00.000Z"
  });
  assert.deepEqual(store.getPlayerStats("device-2"), {
    playerId: "device-2",
    displayName: "South",
    gamesPlayed: 2,
    wins: 1,
    losses: 1,
    nilMade: 1,
    nilFailed: 1,
    bags: 6,
    lastPlayedAt: "2026-06-13T12:00:00.000Z"
  });
  assert.equal(store.listResults({ playerId: "device-1" }).length, 2);
});

test("local account stats leaderboard preview sorts local players and ignores duplicate results", () => {
  const store = createLocalAccountStatsStore({ storage: createMemoryStorage(), namespace: "leaderboard" });
  const first = matchResult({ id: "match-1", winner: "player1" });

  store.recordMatch(first);
  store.recordMatch(first);
  store.recordMatch(matchResult({
    id: "match-2",
    winner: "player1",
    players: {
      player1: { playerId: "device-3", displayName: "East" },
      player2: { playerId: "device-2", displayName: "South" }
    }
  }));

  const leaderboard = store.getLeaderboard();
  assert.deepEqual(leaderboard.map((row) => row.playerId), ["device-3", "device-1", "device-2"]);
  assert.equal(leaderboard[0].wins, 1);
  assert.equal(leaderboard[0].gamesPlayed, 1);
  assert.equal(store.listResults().length, 2);
});

test("local account stats can reset all local preview records", () => {
  const store = createLocalAccountStatsStore({ storage: createMemoryStorage(), namespace: "reset" });
  store.recordMatch(matchResult({ id: "match-1", winner: "player1" }));

  const reset = store.reset();

  assert.deepEqual(reset.records, []);
  assert.deepEqual(reset.players, {});
  assert.deepEqual(store.getLeaderboard(), []);
});

function matchResult(overrides = {}) {
  return {
    id: overrides.id ?? "match-1",
    roomCode: "SPADES",
    timestamp: "2026-06-13T12:00:00.000Z",
    winner: overrides.winner ?? "player1",
    finalScore: { player1: 100, player2: 50 },
    bids: { player1: 4, player2: 3 },
    bags: overrides.bags ?? { player1: 0, player2: 0 },
    nilResults: overrides.nilResults ?? { player1: null, player2: null },
    players: overrides.players ?? {
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
