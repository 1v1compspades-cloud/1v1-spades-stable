import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_V11_LEADERBOARD_SEASON,
  listV11Leaderboard,
  sanitizeLeaderboardLimit,
  sanitizeLeaderboardSeason,
} from "../v11-leaderboards.ts";
import {
  v11LeaderboardStatsTable,
  type V11LeaderboardStatsRow,
} from "@workspace/db/schema/v11-leaderboards";

class FakeLeaderboardDb {
  private readonly rows: V11LeaderboardStatsRow[];

  constructor(rows: V11LeaderboardStatsRow[]) {
    this.rows = rows;
  }

  private getEqValue(condition: unknown): string | null {
    if (!condition || typeof condition !== "object") return null;
    const chunks = (condition as { queryChunks?: Array<{ value?: unknown }> })
      .queryChunks;
    const value = chunks?.find((chunk) => typeof chunk.value === "string")?.value;
    return typeof value === "string" ? value : null;
  }

  select() {
    return {
      from: (table: unknown) => ({
        where: (condition: unknown) => ({
          orderBy: (..._order: unknown[]) => ({
            limit: async (limit: number) => {
              assert.equal(table, v11LeaderboardStatsTable);
              const season = this.getEqValue(condition);
              return this.rows
                .filter((row) => !season || row.seasonKey === season)
                .sort((a, b) => {
                  if (b.wins !== a.wins) return b.wins - a.wins;
                  if (b.gamesPlayed !== a.gamesPlayed) {
                    return b.gamesPlayed - a.gamesPlayed;
                  }
                  return b.pointsFor - a.pointsFor;
                })
                .slice(0, limit);
            },
          }),
        }),
      }),
    };
  }
}

function statsRow(
  patch: Partial<V11LeaderboardStatsRow> & {
    accountId: string;
    normalizedUsername: string;
    displayUsername: string;
  },
): V11LeaderboardStatsRow {
  return {
    id: BigInt(1),
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
    wins: 0,
    losses: 0,
    gamesPlayed: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    currentStreak: 0,
    updatedAt: new Date("2026-06-19T00:00:00.000Z"),
    ...patch,
  };
}

test("v1.1 leaderboard limit sanitization is bounded", () => {
  assert.equal(sanitizeLeaderboardLimit(undefined), 25);
  assert.equal(sanitizeLeaderboardLimit("2"), 2);
  assert.equal(sanitizeLeaderboardLimit("-1"), 25);
  assert.equal(sanitizeLeaderboardLimit("500"), 100);
});

test("v1.1 leaderboard season sanitization defaults unsafe values", () => {
  assert.equal(sanitizeLeaderboardSeason(undefined), DEFAULT_V11_LEADERBOARD_SEASON);
  assert.equal(sanitizeLeaderboardSeason("season_1"), "season_1");
  assert.equal(sanitizeLeaderboardSeason("../prod"), DEFAULT_V11_LEADERBOARD_SEASON);
});

test("v1.1 leaderboard list returns public account-safe rows", async () => {
  const db = new FakeLeaderboardDb([
    statsRow({
      accountId: "acct-hidden-1",
      normalizedUsername: "bravo",
      displayUsername: "Bravo",
      wins: 4,
      losses: 1,
      gamesPlayed: 5,
      pointsFor: 1210,
      pointsAgainst: 900,
      currentStreak: 3,
    }),
    statsRow({
      accountId: "acct-hidden-2",
      normalizedUsername: "alpha",
      displayUsername: "Alpha",
      wins: 6,
      losses: 2,
      gamesPlayed: 8,
      pointsFor: 1800,
      pointsAgainst: 1400,
      currentStreak: -1,
    }),
  ]);

  const entries = await listV11Leaderboard(db, { limit: 10 });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].rank, 1);
  assert.equal(entries[0].username, "Alpha");
  assert.equal(entries[0].winRate, 0.75);
  assert.equal(
    Object.prototype.hasOwnProperty.call(entries[0], "accountId"),
    false,
  );
});

test("v1.1 leaderboard list filters season and applies limit", async () => {
  const db = new FakeLeaderboardDb([
    statsRow({
      accountId: "acct-current",
      normalizedUsername: "current",
      displayUsername: "Current",
      wins: 2,
      gamesPlayed: 2,
    }),
    statsRow({
      seasonKey: "old",
      accountId: "acct-old",
      normalizedUsername: "old",
      displayUsername: "Old",
      wins: 50,
      gamesPlayed: 50,
    }),
  ]);

  const entries = await listV11Leaderboard(db, { limit: 1 });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].username, "Current");
});
