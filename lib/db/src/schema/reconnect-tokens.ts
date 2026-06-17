import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * `reconnect_tokens` — server-issued opaque secret that lets a browser
 * reclaim its seat after refresh / disconnect / server restart. Trust on
 * reconnect is anchored on this token, NEVER the display name.
 *
 * One token per (room, seat). A second join attempt using the same display
 * name from a different token must be rejected — this is what prevents
 * seat hijack.
 *
 * Phase 1 just defines the table. Phase 3 wires create_room/join_room to
 * issue tokens and reconnect_player to validate them.
 */
export const reconnectTokensTable = pgTable(
  "reconnect_tokens",
  {
    token: text("token").primaryKey(),
    roomCode: text("room_code").notNull(),
    seat: integer("seat").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("reconnect_tokens_room_seat_unique").on(t.roomCode, t.seat),
    index("reconnect_tokens_room_idx").on(t.roomCode),
  ],
);

export type ReconnectTokenRow = typeof reconnectTokensTable.$inferSelect;
export type InsertReconnectToken = typeof reconnectTokensTable.$inferInsert;
