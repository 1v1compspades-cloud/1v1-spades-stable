import test from "node:test";
import assert from "node:assert/strict";
import {
  recordCompletedRoomStats,
  sanitizeLeaderboardForPublic
} from "../src/leaderboard-state.js";

test("completed match updates winner and loser stats", () => {
  const stats = new Map();
  const result = recordCompletedRoomStats(stats, completedRoom());

  assert.equal(result.recorded, true);
  assert.ok(result.room.leaderboardRecordedAt);

  const winner = stats.get("guest:winner-player");
  const loser = stats.get("guest:loser-player");
  assert.equal(winner.displayName, "Winner");
  assert.equal(winner.wins, 1);
  assert.equal(winner.losses, 0);
  assert.equal(winner.matchesPlayed, 1);
  assert.equal(winner.pointsFor, 5);
  assert.equal(winner.pointsAgainst, 3);
  assert.equal(loser.displayName, "Loser");
  assert.equal(loser.wins, 0);
  assert.equal(loser.losses, 1);
  assert.equal(loser.matchesPlayed, 1);
  assert.equal(loser.pointsFor, 3);
  assert.equal(loser.pointsAgainst, 5);
});

test("guest stats work by playerId", () => {
  const stats = new Map();
  recordCompletedRoomStats(stats, completedRoom());

  assert.equal(stats.has("guest:winner-player"), true);
  assert.equal(stats.get("guest:winner-player").playerId, "winner-player");
  assert.equal(stats.get("guest:winner-player").accountId, null);
});

test("account stats work and attach accountId", () => {
  const stats = new Map();
  recordCompletedRoomStats(stats, completedRoom({
    winner: {
      playerId: "device-one",
      accountId: "account-one",
      displayName: "Account Winner"
    }
  }));

  assert.equal(stats.has("account:account-one"), true);
  const accountStat = stats.get("account:account-one");
  assert.equal(accountStat.playerId, "device-one");
  assert.equal(accountStat.accountId, "account-one");
  assert.equal(accountStat.displayName, "Account Winner");
  assert.equal(accountStat.wins, 1);
});

test("reconnect and accountId flow does not duplicate stats", () => {
  const stats = new Map();
  const first = recordCompletedRoomStats(stats, completedRoom({
    winner: {
      playerId: "device-one",
      accountId: "account-one",
      displayName: "Account Winner"
    }
  }));
  const second = recordCompletedRoomStats(stats, first.room);

  assert.equal(second.recorded, false);
  assert.equal(stats.get("account:account-one").matchesPlayed, 1);
  assert.equal(stats.get("guest:loser-player").matchesPlayed, 1);
});

test("leaderboard sorts by wins then win percentage", () => {
  const stats = new Map([
    ["guest:a", stat({ displayName: "Three Wins", wins: 3, losses: 2 })],
    ["guest:b", stat({ displayName: "Two Wins Perfect", wins: 2, losses: 0 })],
    ["guest:c", stat({ displayName: "Two Wins Split", wins: 2, losses: 2 })],
    ["guest:d", stat({ displayName: "One Win", wins: 1, losses: 0 })]
  ]);

  const leaderboard = sanitizeLeaderboardForPublic(stats);

  assert.deepEqual(leaderboard.map((row) => row.displayName), [
    "Three Wins",
    "Two Wins Perfect",
    "Two Wins Split",
    "One Win"
  ]);
  assert.equal(leaderboard[1].winPercentage, 100);
  assert.equal(leaderboard[2].winPercentage, 50);
});

test("public leaderboard does not expose private tokens or admin fields", () => {
  const stats = new Map([
    ["account:account-one", {
      ...stat({ displayName: "Account Winner", wins: 4, losses: 1 }),
      accountId: "account-one",
      playerId: "device-one",
      seatToken: "private-seat-token",
      adminKey: "private-admin-key"
    }]
  ]);

  const publicJson = JSON.stringify(sanitizeLeaderboardForPublic(stats));

  assert.match(publicJson, /Account Winner/);
  assert.doesNotMatch(publicJson, /account-one/);
  assert.doesNotMatch(publicJson, /device-one/);
  assert.doesNotMatch(publicJson, /private-seat-token/);
  assert.doesNotMatch(publicJson, /private-admin-key/);
});

function completedRoom({ winner = {}, loser = {} } = {}) {
  return {
    roomCode: "STATS",
    players: {
      player1: {
        seat: "player1",
        seatToken: "winner-token",
        playerId: "winner-player",
        accountId: null,
        displayName: "Winner",
        ...winner
      },
      player2: {
        seat: "player2",
        seatToken: "loser-token",
        playerId: "loser-player",
        accountId: null,
        displayName: "Loser",
        ...loser
      }
    },
    gameState: {
      phase: "match_complete",
      winner: "player1",
      score: {
        player1: 5,
        player2: 3
      }
    }
  };
}

function stat({ displayName, wins, losses }) {
  const matchesPlayed = wins + losses;
  return {
    playerId: `${displayName}-player`,
    accountId: null,
    displayName,
    wins,
    losses,
    matchesPlayed,
    pointsFor: wins * 5,
    pointsAgainst: losses * 5,
    tournamentWins: 0,
    updatedAt: "2026-06-10T00:00:00.000Z"
  };
}
