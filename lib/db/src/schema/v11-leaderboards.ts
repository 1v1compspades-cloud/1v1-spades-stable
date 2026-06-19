import {
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * v1.1 leaderboard result ledger.
 *
 * Inert until migrations are approved and `V11_LEADERBOARDS_ENABLED` is
 * explicitly enabled. MVP policy: only account-vs-account quick matches are
 * eligible for public leaderboard stats; guest play remains default and is
 * not represented here.
 */
export const v11LeaderboardResultsTable = pgTable(
  "v11_leaderboard_results",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    seasonKey: text("season_key").notNull().default("v1_1_beta"),
    roomCode: text("room_code").notNull(),
    winnerAccountId: text("winner_account_id").notNull(),
    loserAccountId: text("loser_account_id").notNull(),
    winnerUsername: text("winner_username").notNull(),
    loserUsername: text("loser_username").notNull(),
    winnerScore: integer("winner_score").notNull(),
    loserScore: integer("loser_score").notNull(),
    winnerBags: integer("winner_bags").notNull().default(0),
    loserBags: integer("loser_bags").notNull().default(0),
    roundsPlayed: integer("rounds_played").notNull().default(0),
    resultReason: text("result_reason").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("v11_leaderboard_results_room_unique").on(t.roomCode),
    index("v11_leaderboard_results_season_idx").on(t.seasonKey),
    index("v11_leaderboard_results_winner_idx").on(t.winnerAccountId),
    index("v11_leaderboard_results_loser_idx").on(t.loserAccountId),
  ],
);

/**
 * Cached public leaderboard rows for fast reads.
 *
 * `display_username` is denormalized from v11_usernames at write time so the
 * public API never needs to expose account ids or deleted account internals.
 */
export const v11LeaderboardStatsTable = pgTable(
  "v11_leaderboard_stats",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    seasonKey: text("season_key").notNull().default("v1_1_beta"),
    accountId: text("account_id").notNull(),
    normalizedUsername: text("normalized_username").notNull(),
    displayUsername: text("display_username").notNull(),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    pointsFor: integer("points_for").notNull().default(0),
    pointsAgainst: integer("points_against").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("v11_leaderboard_stats_account_season_unique").on(
      t.accountId,
      t.seasonKey,
    ),
    index("v11_leaderboard_stats_season_wins_idx").on(t.seasonKey, t.wins),
    index("v11_leaderboard_stats_username_idx").on(t.normalizedUsername),
  ],
);

export type V11LeaderboardResultRow =
  typeof v11LeaderboardResultsTable.$inferSelect;
export type InsertV11LeaderboardResult =
  typeof v11LeaderboardResultsTable.$inferInsert;
export type V11LeaderboardStatsRow =
  typeof v11LeaderboardStatsTable.$inferSelect;
export type InsertV11LeaderboardStats =
  typeof v11LeaderboardStatsTable.$inferInsert;
