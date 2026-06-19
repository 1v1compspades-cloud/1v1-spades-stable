import { desc, eq } from "drizzle-orm";
import {
  v11LeaderboardStatsTable,
  type V11LeaderboardStatsRow,
} from "@workspace/db/schema/v11-leaderboards";

export type V11LeaderboardDb = {
  select: (...args: unknown[]) => any;
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
  winRate: number;
  currentStreak: number;
  updatedAt: Date;
};

export const DEFAULT_V11_LEADERBOARD_SEASON = "v1_1_beta";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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
