import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_V11_LEADERBOARD_SEASON,
  listV11Leaderboard,
  recordV11CompletedMatchLeaderboardResult,
  recordV11LeaderboardResult,
  sanitizeLeaderboardLimit,
  sanitizeLeaderboardSeason,
} from "../v11-leaderboards.ts";
import {
  v11LeaderboardResultsTable,
  v11LeaderboardStatsTable,
  type V11LeaderboardResultRow,
  type V11LeaderboardStatsRow,
} from "@workspace/db/schema/v11-leaderboards";

class FakeUniqueError extends Error {
  code = "23505";
  constraint: string;

  constructor(constraint: string) {
    super("duplicate key value violates unique constraint");
    this.constraint = constraint;
  }
}

class FakeWrappedUniqueError extends Error {
  cause: FakeUniqueError;

  constructor(constraint: string) {
    super("Failed query");
    this.cause = new FakeUniqueError(constraint);
  }
}

class FakeLeaderboardDb {
  results: V11LeaderboardResultRow[] = [];
  stats: V11LeaderboardStatsRow[];

  constructor(rows: V11LeaderboardStatsRow[] = []) {
    this.stats = [...rows];
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
              return this.stats
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

  insert(table: unknown) {
    return {
      values: (row: any) => {
        if (table === v11LeaderboardResultsTable) {
          return this.addResult(row);
        }

        return {
          onConflictDoUpdate: async () => {
            if (table !== v11LeaderboardStatsTable) {
              throw new Error("Unknown table");
            }

            const existing = this.stats.find(
              (stats) =>
                stats.accountId === row.accountId &&
                stats.seasonKey === row.seasonKey,
            );

            if (existing) {
              existing.displayUsername = row.displayUsername;
              existing.normalizedUsername = row.normalizedUsername;
              existing.wins += row.wins;
              existing.losses += row.losses;
              existing.gamesPlayed += row.gamesPlayed;
              existing.pointsFor += row.pointsFor;
              existing.pointsAgainst += row.pointsAgainst;
              existing.bagsTaken += row.bagsTaken;
              existing.bagsGiven += row.bagsGiven;
              if (row.currentStreak > 0) {
                existing.currentStreak =
                  existing.currentStreak > 0 ? existing.currentStreak + 1 : 1;
              } else {
                existing.currentStreak =
                  existing.currentStreak < 0 ? existing.currentStreak - 1 : -1;
              }
              existing.updatedAt = row.updatedAt;
            } else {
              this.stats.push(statsRow(row));
            }
          },
        };
      },
    };
  }

  async transaction<T>(callback: (tx: FakeLeaderboardDb) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async addResult(row: any): Promise<void> {
    if (this.results.some((result) => result.roomCode === row.roomCode)) {
      throw new FakeWrappedUniqueError("v11_leaderboard_results_room_unique");
    }
    this.results.push({
      id: BigInt(this.results.length + 1),
      seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
      winnerBags: 0,
      loserBags: 0,
      roundsPlayed: 0,
      completedAt: new Date("2026-06-19T00:00:00.000Z"),
      createdAt: new Date("2026-06-19T00:00:00.000Z"),
      ...row,
    });
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
    bagsTaken: 0,
    bagsGiven: 0,
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
  assert.equal(entries[0].bagsTaken, 0);
  assert.equal(entries[0].bagsGiven, 0);
  assert.equal(
    Object.prototype.hasOwnProperty.call(entries[0], "accountId"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(entries[0], "normalizedUsername"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(entries[0], "displayUsername"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(entries[0], "emailHash"),
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

test("v1.1 leaderboard result write skips guest or unidentified games", async () => {
  const db = new FakeLeaderboardDb();

  const result = await recordV11LeaderboardResult(db, {
    roomCode: "ROOM1",
    winnerUsername: "Winner",
    loserUsername: "Loser",
    winnerScore: 250,
    loserScore: 180,
    resultReason: "normal_win",
  });

  assert.deepEqual(result, {
    recorded: false,
    skipped: "missing_account_identity",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 0);
  assert.equal(db.stats.length, 0);
});

test("v1.1 leaderboard result write records account-vs-account stats", async () => {
  const db = new FakeLeaderboardDb();

  const result = await recordV11LeaderboardResult(db, {
    roomCode: "ROOM2",
    winnerAccountId: "acct-winner",
    loserAccountId: "acct-loser",
    winnerUsername: "Winner",
    loserUsername: "Loser",
    winnerScore: 260,
    loserScore: 170,
    winnerBags: 2,
    loserBags: 4,
    roundsPlayed: 8,
    resultReason: "normal_win",
  });

  assert.deepEqual(result, {
    recorded: true,
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 1);
  assert.equal(db.results[0].roomCode, "ROOM2");
  assert.equal(db.stats.length, 2);

  const winner = db.stats.find((row) => row.accountId === "acct-winner");
  const loser = db.stats.find((row) => row.accountId === "acct-loser");
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(winner.wins, 1);
  assert.equal(winner.gamesPlayed, 1);
  assert.equal(winner.pointsFor, 260);
  assert.equal(winner.pointsAgainst, 170);
  assert.equal(winner.bagsTaken, 2);
  assert.equal(winner.bagsGiven, 4);
  assert.equal(winner.currentStreak, 1);
  assert.equal(loser.losses, 1);
  assert.equal(loser.bagsTaken, 4);
  assert.equal(loser.bagsGiven, 2);
  assert.equal(loser.currentStreak, -1);
});

test("v1.1 leaderboard result write is idempotent per room", async () => {
  const db = new FakeLeaderboardDb();
  const input = {
    roomCode: "ROOM3",
    winnerAccountId: "acct-winner",
    loserAccountId: "acct-loser",
    winnerUsername: "Winner",
    loserUsername: "Loser",
    winnerScore: 250,
    loserScore: 190,
    resultReason: "forfeit",
  };

  await recordV11LeaderboardResult(db, input);
  const duplicate = await recordV11LeaderboardResult(db, input);

  assert.deepEqual(duplicate, {
    recorded: false,
    skipped: "duplicate_result",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 1);
  assert.equal(db.stats.length, 2);
  assert.equal(db.stats.reduce((sum, row) => sum + row.gamesPlayed, 0), 2);
  assert.equal(db.stats.reduce((sum, row) => sum + row.bagsTaken, 0), 0);
  assert.equal(db.stats.reduce((sum, row) => sum + row.bagsGiven, 0), 0);
});

test("v1.1 leaderboard result write rejects invalid and same-account results", async () => {
  const db = new FakeLeaderboardDb();

  const invalid = await recordV11LeaderboardResult(db, {
    roomCode: "",
    winnerAccountId: "acct-1",
    loserAccountId: "acct-2",
    winnerUsername: "One",
    loserUsername: "Two",
    winnerScore: 250,
    loserScore: 190,
    resultReason: "normal_win",
  });
  const sameAccount = await recordV11LeaderboardResult(db, {
    roomCode: "ROOM4",
    winnerAccountId: "acct-1",
    loserAccountId: "acct-1",
    winnerUsername: "One",
    loserUsername: "Two",
    winnerScore: 250,
    loserScore: 190,
    resultReason: "normal_win",
  });

  assert.equal(invalid.recorded, false);
  assert.equal(invalid.skipped, "invalid_result");
  assert.equal(sameAccount.recorded, false);
  assert.equal(sameAccount.skipped, "same_account");
  assert.equal(db.results.length, 0);
  assert.equal(db.stats.length, 0);
});

test("v1.1 completed match leaderboard write is feature gated", async () => {
  const db = new FakeLeaderboardDb();

  const result = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM5",
      mode: "quick",
      phase: "game_over",
      resultReason: "normal_win",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      finalScores: [250, 220],
      bags: [0, 2],
      roundsPlayed: 6,
    },
    { enabled: false },
  );

  assert.deepEqual(result, {
    recorded: false,
    skipped: "feature_disabled",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 0);
  assert.equal(db.stats.length, 0);
});

test("v1.1 completed ranked normal quick match records once", async () => {
  const db = new FakeLeaderboardDb();

  const result = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM6",
      mode: "quick",
      phase: "game_over",
      resultReason: "normal_win",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      winnerIdentityValidated: true,
      loserIdentityValidated: true,
      finalScores: [251, 180],
      bags: [1, 0],
      roundsPlayed: 7,
    },
    { enabled: true },
  );
  const duplicate = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM6",
      mode: "quick",
      phase: "game_over",
      resultReason: "normal_win",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      winnerIdentityValidated: true,
      loserIdentityValidated: true,
      finalScores: [251, 180],
      bags: [1, 0],
      roundsPlayed: 7,
    },
    { enabled: true },
  );

  assert.equal(result.recorded, true);
  assert.deepEqual(duplicate, {
    recorded: false,
    skipped: "duplicate_result",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 1);
  assert.equal(db.stats.length, 2);
  assert.equal(db.stats.reduce((sum, row) => sum + row.gamesPlayed, 0), 2);
  assert.equal(db.stats.reduce((sum, row) => sum + row.bagsTaken, 0), 1);
  assert.equal(db.stats.reduce((sum, row) => sum + row.bagsGiven, 0), 1);
});

test("v1.1 completed ranked forfeits record winner and loser", async () => {
  const db = new FakeLeaderboardDb();

  const manual = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM6F",
      mode: "quick",
      phase: "game_over",
      resultReason: "forfeit",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      winnerIdentityValidated: true,
      loserIdentityValidated: true,
      finalScores: [90, 80],
      bags: [2, 3],
      roundsPlayed: 3,
    },
    { enabled: true },
  );
  const afk = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM6A",
      mode: "quick",
      phase: "game_over",
      resultReason: "afk_forfeit",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      winnerIdentityValidated: true,
      loserIdentityValidated: true,
      finalScores: [110, 95],
      bags: [1, 4],
      roundsPlayed: 4,
    },
    { enabled: true },
  );

  assert.equal(manual.recorded, true);
  assert.equal(afk.recorded, true);
  assert.equal(db.results.length, 2);
  assert.equal(db.stats.length, 2);

  const winner = db.stats.find((row) => row.accountId === "acct-winner");
  const loser = db.stats.find((row) => row.accountId === "acct-loser");
  assert.ok(winner);
  assert.ok(loser);
  assert.equal(winner.wins, 2);
  assert.equal(winner.gamesPlayed, 2);
  assert.equal(winner.pointsFor, 200);
  assert.equal(winner.pointsAgainst, 175);
  assert.equal(winner.currentStreak, 2);
  assert.equal(loser.losses, 2);
  assert.equal(loser.gamesPlayed, 2);
  assert.equal(loser.pointsFor, 175);
  assert.equal(loser.pointsAgainst, 200);
  assert.equal(loser.currentStreak, -2);
});

test("v1.1 completed ranked match rejects unvalidated account identity", async () => {
  const db = new FakeLeaderboardDb();

  const result = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM6U",
      mode: "quick",
      phase: "game_over",
      resultReason: "normal_win",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      winnerIdentityValidated: false,
      loserIdentityValidated: true,
      finalScores: [251, 180],
      bags: [1, 0],
      roundsPlayed: 7,
    },
    { enabled: true },
  );

  assert.deepEqual(result, {
    recorded: false,
    skipped: "missing_account_identity",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 0);
  assert.equal(db.stats.length, 0);
});

test("v1.1 completed casual account match writes nothing", async () => {
  const db = new FakeLeaderboardDb();

  const result = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM6C",
      mode: "quick",
      phase: "game_over",
      resultReason: "normal_win",
      matchKind: "casual",
      leaderboardEligible: false,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      finalScores: [251, 180],
      bags: [1, 0],
      roundsPlayed: 7,
    },
    { enabled: true },
  );

  assert.deepEqual(result, {
    recorded: false,
    skipped: "ineligible_match",
    seasonKey: DEFAULT_V11_LEADERBOARD_SEASON,
  });
  assert.equal(db.results.length, 0);
  assert.equal(db.stats.length, 0);
});

test("v1.1 completed match leaderboard skips admin, tournament, or incomplete games", async () => {
  const db = new FakeLeaderboardDb();

  const autoVictory = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM7",
      mode: "quick",
      phase: "game_over",
      resultReason: "auto_victory",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      winnerIdentityValidated: true,
      loserIdentityValidated: true,
      finalScores: [90, 80],
    },
    { enabled: true },
  );
  const incomplete = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM8",
      mode: "quick",
      phase: "playing",
      resultReason: "normal_win",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      finalScores: [120, 90],
    },
    { enabled: true },
  );
  const tournament = await recordV11CompletedMatchLeaderboardResult(
    db,
    {
      roomCode: "ROOM9",
      mode: "quick",
      phase: "game_over",
      tournamentRef: { code: "T1", matchId: "M1" },
      resultReason: "normal_win",
      matchKind: "ranked",
      leaderboardEligible: true,
      winnerAccountId: "acct-winner",
      loserAccountId: "acct-loser",
      winnerUsername: "Winner",
      loserUsername: "Loser",
      finalScores: [250, 200],
    },
    { enabled: true },
  );

  assert.equal(autoVictory.recorded, false);
  assert.equal(autoVictory.skipped, "ineligible_match");
  assert.equal(incomplete.recorded, false);
  assert.equal(incomplete.skipped, "ineligible_match");
  assert.equal(tournament.recorded, false);
  assert.equal(tournament.skipped, "ineligible_match");
  assert.equal(db.results.length, 0);
  assert.equal(db.stats.length, 0);
});
