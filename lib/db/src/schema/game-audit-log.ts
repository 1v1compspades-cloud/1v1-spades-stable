import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  bigserial,
  index,
} from "drizzle-orm/pg-core";

/**
 * `game_audit_log` — append-only debug trail for every meaningful state
 * transition. Retention is 30 days; the cleanup sweep will be wired in
 * Phase 2 alongside the TTL sweep for active_rooms.
 *
 * The `payload` jsonb should stay SMALL — store the actor's intent
 * (e.g. `{ card: "AS" }`, `{ bid: 4 }`), not the whole resulting state.
 * The before/after state is identified by hash, not snapshot, to keep
 * this table from exploding.
 */
export const gameAuditLogTable = pgTable(
  "game_audit_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    roomCode: text("room_code"),
    /** Player token (opaque) or null for server-driven events. */
    actorToken: text("actor_token"),
    actorSeat: integer("actor_seat"),
    /**
     * One of: room_created, player_joined, coin_toss, cards_dealt,
     * bid_placed, card_played, trick_completed, round_completed,
     * score_updated, forfeit, disconnect, reconnect, match_completed,
     * server_restart_recovery.
     */
    action: text("action").notNull(),
    payload: jsonb("payload"),
    prevStateHash: text("prev_state_hash"),
    newStateHash: text("new_state_hash"),
    error: text("error"),
  },
  (t) => [
    index("game_audit_log_room_at_idx").on(t.roomCode, t.at),
    index("game_audit_log_at_idx").on(t.at),
  ],
);

export type GameAuditLogRow = typeof gameAuditLogTable.$inferSelect;
export type InsertGameAuditLog = typeof gameAuditLogTable.$inferInsert;
