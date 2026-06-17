import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * `match_results` — append-only completed-match ledger.
 *
 * This is account-foundation data only: it records display/profile identity
 * and final outcome metadata. It does not imply payments, wagering, prizes, or
 * signed-in auth.
 */
export const matchResultsTable = pgTable(
  "match_results",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    roomCode: text("room_code").notNull(),
    mode: text("mode").notNull(),
    matchLabel: text("match_label"),
    tournamentCode: text("tournament_code"),
    tournamentMatchId: text("tournament_match_id"),
    winnerSeat: integer("winner_seat").notNull(),
    loserSeat: integer("loser_seat").notNull(),
    winnerName: text("winner_name").notNull(),
    loserName: text("loser_name").notNull(),
    winnerUsername: text("winner_username"),
    loserUsername: text("loser_username"),
    score0: integer("score_0").notNull(),
    score1: integer("score_1").notNull(),
    resultReason: text("result_reason").notNull(),
    summary: jsonb("summary").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("match_results_room_idx").on(t.roomCode),
    index("match_results_completed_at_idx").on(t.completedAt),
    index("match_results_winner_idx").on(t.winnerUsername, t.winnerName),
  ],
);

export type MatchResultRow = typeof matchResultsTable.$inferSelect;
export type InsertMatchResult = typeof matchResultsTable.$inferInsert;
