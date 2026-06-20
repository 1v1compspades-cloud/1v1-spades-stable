import { desc, eq, sql } from "drizzle-orm";
import {
  v11LeaderboardResultsTable,
  v11LeaderboardStatsTable,
  type InsertV11LeaderboardResult,
  type V11LeaderboardStatsRow,
} from "@workspace/db/schema/v11-leaderboards";

export type V11LeaderboardDb = {
  select: (...args: unknown[]) => any;
  insert: (...args: unknown[]) => any;
  transaction?: <T>(callback: (tx: V11LeaderboardDb) => Promise<T>) => Promise<T>;
};

export type PublicV11LeaderboardEntry = {
  rank: number;
  seasonKey: string;
  username: string;
  wins: number;
  losses: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  bagsTaken: number;
  bagsGiven: number;
  winRate: number;
  currentStreak: number;
  updatedAt: Date;
};

export type V11LeaderboardRecordInput = {
  roomCode: unknown;
  seasonKey?: unknown;
  winnerAccountId?: unknown;
  loserAccountId?: unknown;
  winnerUsername?: unknown;
  loserUsername?: unknown;
  winnerScore?: unknown;
  loserScore?: unknown;
  winnerBags?: unknown;
  loserBags?: unknown;
  roundsPlayed?: unknown;
  resultReason?: unknown;
  completedAt?: Date;
};

export type V11LeaderboardRecordResult =
  | { recorded: true; seasonKey: string }
  | {
      recorded: false;
      skipped:
        | "duplicate_result"
        | "feature_disabled"
        | "ineligible_match"
        | "invalid_result"
        | "missing_account_identity"
        | "same_account";
      seasonKey: string;
    };

export type V11CompletedMatchLeaderboardInput = {
  roomCode: unknown;
  mode: unknown;
  phase: unknown;
  tournamentRef?: unknown;
  resultReason: unknown;
  winnerAccountId?: unknown;
  loserAccountId?: unknown;
  winnerUsername?: unknown;
  loserUsername?: unknown;
  finalScores?: unknown;
  bags?: unknown;
  roundsPlayed?: unknown;
  seasonKey?: unknown;
  completedAt?: Date;
};

export const DEFAULT_V11_LEADERBOARD_SEASON = "v1_1_beta";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_ROOM_CODE_LENGTH = 16;
const MAX_REASON_LENGTH = 40;

export function sanitizeLeaderboardLimit(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(numeric));
}

export function sanitizeLeaderboardSeason(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_V11_LEADERBOARD_SEASON;
  const normalized = value.trim();
  if (!normalized || normalized.length > 40 || !/^[a-z0-9_-]+$/i.test(normalized)) {
    return DEFAULT_V11_LEADERBOARD_SEASON;
  }
  return normalized;
}

function sanitizeNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function sanitizeInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return null;
  return numeric;
}

function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const source =
    "cause" in error && error.cause && typeof error.cause === "object"
      ? error.cause
      : error;
  const candidate = source as { code?: string; constraint?: string };
  if (candidate.code !== "23505") return false;
  return !constraint || candidate.constraint === constraint;
}

function toPublicEntry(
  row: V11LeaderboardStatsRow,
  index: number,
): PublicV11LeaderboardEntry {
  const gamesPlayed = Math.max(0, row.gamesPlayed);
  const wins = Math.max(0, row.wins);
  const losses = Math.max(0, row.losses);

  return {
    rank: index + 1,
    seasonKey: row.seasonKey,
    username: row.displayUsername,
    wins,
    losses,
    gamesPlayed,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    bagsTaken: row.bagsTaken,
    bagsGiven: row.bagsGiven,
    winRate: gamesPlayed > 0 ? Number((wins / gamesPlayed).toFixed(4)) : 0,
    currentStreak: row.currentStreak,
    updatedAt: row.updatedAt,
  };
}

export async function listV11Leaderboard(
  db: V11LeaderboardDb,
  input: { limit?: unknown; seasonKey?: unknown } = {},
): Promise<PublicV11LeaderboardEntry[]> {
  const limit = sanitizeLeaderboardLimit(input.limit);
  const seasonKey = sanitizeLeaderboardSeason(input.seasonKey);

  const rows = (await db
    .select()
    .from(v11LeaderboardStatsTable)
    .where(eq(v11LeaderboardStatsTable.seasonKey, seasonKey))
    .orderBy(
      desc(v11LeaderboardStatsTable.wins),
      desc(v11LeaderboardStatsTable.gamesPlayed),
      desc(v11LeaderboardStatsTable.pointsFor),
    )
    .limit(limit)) as V11LeaderboardStatsRow[];

  return rows.map(toPublicEntry);
}

async function insertStatsDelta(
  db: V11LeaderboardDb,
  input: {
    seasonKey: string;
    accountId: string;
    username: string;
    won: boolean;
    pointsFor: number;
    pointsAgainst: number;
    bagsTaken: number;
    bagsGiven: number;
  },
): Promise<void> {
  await db
    .insert(v11LeaderboardStatsTable)
    .values({
      seasonKey: input.seasonKey,
      accountId: input.accountId,
      normalizedUsername: input.username.toLowerCase(),
      displayUsername: input.username,
      wins: input.won ? 1 : 0,
      losses: input.won ? 0 : 1,
      gamesPlayed: 1,
      pointsFor: input.pointsFor,
      pointsAgainst: input.pointsAgainst,
      bagsTaken: input.bagsTaken,
      bagsGiven: input.bagsGiven,
      currentStreak: input.won ? 1 : -1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        v11LeaderboardStatsTable.accountId,
        v11LeaderboardStatsTable.seasonKey,
      ],
      set: {
        normalizedUsername: input.username.toLowerCase(),
        displayUsername: input.username,
        wins: input.won
          ? sql`${v11LeaderboardStatsTable.wins} + 1`
          : v11LeaderboardStatsTable.wins,
        losses: input.won
          ? v11LeaderboardStatsTable.losses
          : sql`${v11LeaderboardStatsTable.losses} + 1`,
        gamesPlayed: sql`${v11LeaderboardStatsTable.gamesPlayed} + 1`,
        pointsFor: sql`${v11LeaderboardStatsTable.pointsFor} + ${input.pointsFor}`,
        pointsAgainst: sql`${v11LeaderboardStatsTable.pointsAgainst} + ${input.pointsAgainst}`,
        bagsTaken: sql`${v11LeaderboardStatsTable.bagsTaken} + ${input.bagsTaken}`,
        bagsGiven: sql`${v11LeaderboardStatsTable.bagsGiven} + ${input.bagsGiven}`,
        currentStreak: input.won
          ? sql`case when ${v11LeaderboardStatsTable.currentStreak} > 0 then ${v11LeaderboardStatsTable.currentStreak} + 1 else 1 end`
          : sql`case when ${v11LeaderboardStatsTable.currentStreak} < 0 then ${v11LeaderboardStatsTable.currentStreak} - 1 else -1 end`,
        updatedAt: new Date(),
      },
    });
}

async function recordV11LeaderboardResultWithDb(
  db: V11LeaderboardDb,
  row: InsertV11LeaderboardResult,
): Promise<void> {
  await db.insert(v11LeaderboardResultsTable).values(row);
  await insertStatsDelta(db, {
    seasonKey: row.seasonKey ?? DEFAULT_V11_LEADERBOARD_SEASON,
    accountId: row.winnerAccountId,
    username: row.winnerUsername,
    won: true,
    pointsFor: row.winnerScore,
    pointsAgainst: row.loserScore,
    bagsTaken: row.winnerBags ?? 0,
    bagsGiven: row.loserBags ?? 0,
  });
  await insertStatsDelta(db, {
    seasonKey: row.seasonKey ?? DEFAULT_V11_LEADERBOARD_SEASON,
    accountId: row.loserAccountId,
    username: row.loserUsername,
    won: false,
    pointsFor: row.loserScore,
    pointsAgainst: row.winnerScore,
    bagsTaken: row.loserBags ?? 0,
    bagsGiven: row.winnerBags ?? 0,
  });
}

export async function recordV11LeaderboardResult(
  db: V11LeaderboardDb,
  input: V11LeaderboardRecordInput,
): Promise<V11LeaderboardRecordResult> {
  const seasonKey = sanitizeLeaderboardSeason(input.seasonKey);
  const roomCode = sanitizeNonEmptyText(input.roomCode);
  const winnerAccountId = sanitizeNonEmptyText(input.winnerAccountId);
  const loserAccountId = sanitizeNonEmptyText(input.loserAccountId);
  const winnerUsername = sanitizeNonEmptyText(input.winnerUsername);
  const loserUsername = sanitizeNonEmptyText(input.loserUsername);
  const winnerScore = sanitizeInteger(input.winnerScore);
  const loserScore = sanitizeInteger(input.loserScore);
  const winnerBags = sanitizeInteger(input.winnerBags) ?? 0;
  const loserBags = sanitizeInteger(input.loserBags) ?? 0;
  const roundsPlayed = sanitizeInteger(input.roundsPlayed) ?? 0;
  const resultReason = sanitizeNonEmptyText(input.resultReason);

  if (
    !roomCode ||
    roomCode.length > MAX_ROOM_CODE_LENGTH ||
    winnerScore === null ||
    loserScore === null ||
    !resultReason ||
    resultReason.length > MAX_REASON_LENGTH
  ) {
    return { recorded: false, skipped: "invalid_result", seasonKey };
  }

  if (
    !winnerAccountId ||
    !loserAccountId ||
    !winnerUsername ||
    !loserUsername
  ) {
    return { recorded: false, skipped: "missing_account_identity", seasonKey };
  }

  if (winnerAccountId === loserAccountId) {
    return { recorded: false, skipped: "same_account", seasonKey };
  }

  const row: InsertV11LeaderboardResult = {
    seasonKey,
    roomCode,
    winnerAccountId,
    loserAccountId,
    winnerUsername,
    loserUsername,
    winnerScore,
    loserScore,
    winnerBags,
    loserBags,
    roundsPlayed,
    resultReason,
    completedAt: input.completedAt,
  };

  try {
    if (db.transaction) {
      await db.transaction((tx) => recordV11LeaderboardResultWithDb(tx, row));
    } else {
      await recordV11LeaderboardResultWithDb(db, row);
    }
  } catch (error) {
    if (isUniqueViolation(error, "v11_leaderboard_results_room_unique")) {
      return { recorded: false, skipped: "duplicate_result", seasonKey };
    }
    throw error;
  }

  return { recorded: true, seasonKey };
}

function readScorePair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = sanitizeInteger(value[0]);
  const second = sanitizeInteger(value[1]);
  return first === null || second === null ? null : [first, second];
}

export async function recordV11CompletedMatchLeaderboardResult(
  db: V11LeaderboardDb,
  input: V11CompletedMatchLeaderboardInput,
  options: { enabled: boolean },
): Promise<V11LeaderboardRecordResult> {
  const seasonKey = sanitizeLeaderboardSeason(input.seasonKey);

  if (!options.enabled) {
    return { recorded: false, skipped: "feature_disabled", seasonKey };
  }

  if (
    input.phase !== "game_over" ||
    input.mode !== "quick" ||
    input.tournamentRef ||
    input.resultReason !== "normal_win"
  ) {
    return { recorded: false, skipped: "ineligible_match", seasonKey };
  }

  const finalScores = readScorePair(input.finalScores);
  const bags = readScorePair(input.bags) ?? [0, 0];
  if (!finalScores) {
    return { recorded: false, skipped: "invalid_result", seasonKey };
  }

  const winnerScore = sanitizeInteger(finalScores[0]);
  const loserScore = sanitizeInteger(finalScores[1]);
  if (winnerScore === null || loserScore === null) {
    return { recorded: false, skipped: "invalid_result", seasonKey };
  }

  return recordV11LeaderboardResult(db, {
    roomCode: input.roomCode,
    seasonKey,
    winnerAccountId: input.winnerAccountId,
    loserAccountId: input.loserAccountId,
    winnerUsername: input.winnerUsername,
    loserUsername: input.loserUsername,
    winnerScore,
    loserScore,
    winnerBags: bags[0],
    loserBags: bags[1],
    roundsPlayed: input.roundsPlayed,
    resultReason: input.resultReason,
    completedAt: input.completedAt,
  });
}
