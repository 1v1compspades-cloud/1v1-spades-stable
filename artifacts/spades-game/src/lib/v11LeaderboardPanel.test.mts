import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLeaderboardPanelState,
  formatBags,
  formatSeasonLabel,
  formatStreak,
  formatWinRate,
  leaderboardEndpoint,
} from "./v11LeaderboardPanel.js";

test("leaderboard panel is hidden when flag is false", () => {
  const state = computeLeaderboardPanelState({
    enabled: false,
    loading: false,
    error: null,
    data: null,
  });

  assert.deepEqual(state, { kind: "hidden" });
});

test("leaderboard panel uses top ten endpoint", () => {
  assert.equal(leaderboardEndpoint(), "/api/v1.1/leaderboards?limit=10");
});

test("leaderboard panel renders entries state", () => {
  const state = computeLeaderboardPanelState({
    enabled: true,
    loading: false,
    error: null,
    data: {
      seasonKey: "v1_1_beta",
      entries: [
        {
          rank: 1,
          username: "Alpha",
          wins: 3,
          losses: 1,
          gamesPlayed: 4,
          winRate: 0.75,
          currentStreak: 2,
          bagsTaken: 5,
          bagsGiven: 3,
        },
      ],
    },
  });

  assert.equal(state.kind, "entries");
  assert.equal(state.kind === "entries" && state.entries[0].username, "Alpha");
  assert.equal(state.kind === "entries" && state.entries[0].bagsTaken, 5);
  assert.equal(state.kind === "entries" && state.entries[0].bagsGiven, 3);
});

test("leaderboard panel renders empty and error states", () => {
  assert.deepEqual(
    computeLeaderboardPanelState({
      enabled: true,
      loading: false,
      error: null,
      data: { seasonKey: "v1_1_beta", entries: [] },
    }),
    { kind: "empty", seasonKey: "v1_1_beta" },
  );

  assert.deepEqual(
    computeLeaderboardPanelState({
      enabled: true,
      loading: false,
      error: "Leaderboard unavailable.",
      data: null,
    }),
    { kind: "error", message: "Leaderboard unavailable." },
  );
});

test("leaderboard panel formats win rate and streak", () => {
  assert.equal(formatWinRate(0.755), "76%");
  assert.equal(formatWinRate(0), "0%");
  assert.equal(formatStreak(3), "+3");
  assert.equal(formatStreak(-2), "-2");
  assert.equal(formatStreak(0), "0");
  assert.equal(formatBags(4.9), "4");
  assert.equal(formatBags(undefined), "0");
});

test("leaderboard panel formats the beta season for display", () => {
  assert.equal(formatSeasonLabel("v1_1_beta"), "Season 0 Beta");
  assert.equal(formatSeasonLabel("season_1"), "season_1");
});
