import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * `tournament_matches` — durable record of every bracket match.
 *
 * Carries enough denormalized data (player names, winner, room_code) that a
 * bracket can be rebuilt and advanced from cold storage. The `state` jsonb
 * is the per-match struct from the in-memory `Tournament.rounds[r][m]`
 * (round, position, playerA, playerB, winner, winnerName, roomCode).
 */
export const tournamentMatchesTable = pgTable(
  "tournament_matches",
  {
    tournamentCode: text("tournament_code").notNull(),
    matchId: text("match_id").notNull(),
    round: integer("round").notNull(),
    position: integer("position").notNull(),
    playerAName: text("player_a_name"),
    playerBName: text("player_b_name"),
    winnerName: text("winner_name"),
    /** Room created for this match once both sides are known. */
    roomCode: text("room_code"),
    /** Full match struct (mirrors TournamentMatch). */
    state: jsonb("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tournamentCode, t.matchId] }),
    index("tournament_matches_tournament_idx").on(t.tournamentCode),
    index("tournament_matches_room_idx").on(t.roomCode),
  ],
);

export type TournamentMatchRow = typeof tournamentMatchesTable.$inferSelect;
export type InsertTournamentMatch = typeof tournamentMatchesTable.$inferInsert;
