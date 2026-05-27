import {
  pgTable,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * `active_rooms` — the durable mirror of an in-memory Spades `GameState`.
 *
 * Phase 1 introduces this table and the persistence helpers around it but
 * does NOT yet write through on gameplay. Phase 2 will wire `updateRoom`
 * to call `saveRoomState` and rehydrate on boot.
 *
 * Hidden-hand safety: the `state` jsonb stores the FULL server-private view
 * (both hands, both bids, etc). It must NEVER be returned through any HTTP
 * route or socket emit. Sanitization happens only at the emit boundary via
 * `sanitizeStateForPlayer` / `sanitizeStateForSpectator`.
 */
export const activeRoomsTable = pgTable(
  "active_rooms",
  {
    roomCode: text("room_code").primaryKey(),
    mode: text("mode").notNull(), // "quick" | "king"
    phase: text("phase").notNull(),
    matchLabel: text("match_label"),
    tournamentCode: text("tournament_code"),
    tournamentMatchId: text("tournament_match_id"),
    /** Full private GameState, with ephemeral socketIds stripped. */
    state: jsonb("state").notNull(),
    /** sha256 of the canonical-JSON of `state` at write time. */
    stateHash: text("state_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Bumped on every save. Drives the idle-room TTL sweep. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Set the first time `phase` becomes `game_over`. Drives end-of-life TTL. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("active_rooms_updated_at_idx").on(t.updatedAt),
    index("active_rooms_tournament_idx").on(
      t.tournamentCode,
      t.tournamentMatchId,
    ),
  ],
);

export type ActiveRoomRow = typeof activeRoomsTable.$inferSelect;
export type InsertActiveRoom = typeof activeRoomsTable.$inferInsert;
