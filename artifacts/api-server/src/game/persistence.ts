import { eq, lt, and } from "drizzle-orm";
import {
  db,
  activeRoomsTable,
  gameAuditLogTable,
  type ActiveRoomRow,
} from "@workspace/db";
import { updateRoom, type GameState } from "./engine.js";
import { hashState } from "./hash.js";
import { logger } from "../lib/logger.js";

/**
 * Phase 1 persistence helpers for the Spades game state.
 *
 * SCOPE: These helpers exist and are safe to call, but are NOT wired into
 * `updateRoom` / `play_card` / `place_bid` yet. Phase 2 will introduce the
 * sync-through-write at engine mutation points. Calling these now is a
 * no-op for live gameplay — every helper logs but does not throw on DB
 * errors, so the live in-memory game continues even if Postgres is down.
 *
 * SAFETY: `state` jsonb stored here is the FULL server-private view (both
 * players' hands, both bids). It MUST NEVER be returned through any HTTP
 * route or socket emit. Sanitization happens at the emit boundary only,
 * via `sanitizeStateForPlayer` / `sanitizeStateForSpectator` in socket.ts.
 *
 * TTL plan (wired in Phase 2):
 *   - active_rooms, phase=game_over          → delete after ended_at + 2h
 *   - active_rooms, phase=waiting, idle      → delete after updated_at + 30m
 *   - active_rooms, mid-game idle            → forfeit + game_over after updated_at + 6h
 *   - game_audit_log                         → delete after at + 30d
 *   - tournament_matches, completed          → archive after 7d (drop state jsonb)
 */

// Re-exported so future callers (and Phase 2 sweeper) share the same constants.
export const TTL_GAME_OVER_MS = 2 * 60 * 60 * 1000;
export const TTL_WAITING_IDLE_MS = 30 * 60 * 1000;
export const TTL_MIDGAME_IDLE_MS = 6 * 60 * 60 * 1000;
export const TTL_AUDIT_LOG_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sanitize a live `GameState` for durable storage. Strips ephemeral fields
 * that are meaningless across server restarts (socket ids) so a rehydrated
 * room cannot accidentally emit to a long-dead socket.
 *
 * Hands, bids, scores, and all gameplay state ARE kept — this is the
 * server's private view, the source of truth for anti-cheat validation.
 */
function sanitizeStateForPersistence(state: GameState): Record<string, unknown> {
  const players = state.players.map((p) =>
    p ? { ...p, socketId: "" } : null,
  );
  const spectators = state.spectators.map((s) => ({ ...s, socketId: "" }));
  const challengerQueue = state.challengerQueue.map((c) => ({
    ...c,
    socketId: "",
  }));
  return {
    ...state,
    players,
    spectators,
    challengerQueue,
  };
}

/**
 * Upsert the full server-private state for a room.
 * Safe to call from any sync handler; returns the resulting hash (or null
 * on failure) so callers can chain an audit log entry.
 */
export async function saveRoomState(state: GameState): Promise<string | null> {
  const sanitized = sanitizeStateForPersistence(state);
  const stateHash = hashState(sanitized);
  const now = new Date();
  const endedAt = state.phase === "game_over" ? now : null;
  try {
    await db
      .insert(activeRoomsTable)
      .values({
        roomCode: state.roomCode,
        mode: state.mode,
        phase: state.phase,
        matchLabel: state.matchLabel ?? null,
        tournamentCode: state.tournamentRef?.code ?? null,
        tournamentMatchId: state.tournamentRef?.matchId ?? null,
        state: sanitized,
        stateHash,
        updatedAt: now,
        endedAt,
      })
      .onConflictDoUpdate({
        target: activeRoomsTable.roomCode,
        set: {
          mode: state.mode,
          phase: state.phase,
          matchLabel: state.matchLabel ?? null,
          tournamentCode: state.tournamentRef?.code ?? null,
          tournamentMatchId: state.tournamentRef?.matchId ?? null,
          state: sanitized,
          stateHash,
          updatedAt: now,
          // endedAt is set on first transition to game_over; never cleared.
          ...(endedAt ? { endedAt } : {}),
        },
      });
    return stateHash;
  } catch (err) {
    logger.warn(
      { err, roomCode: state.roomCode },
      "saveRoomState failed (live game unaffected)",
    );
    return null;
  }
}

/**
 * Load the persisted row for a room, if any. Returns the raw row — the
 * caller is responsible for deciding how/whether to rehydrate. Phase 2
 * will add `loadAllActiveRooms` for boot recovery.
 */
export async function loadRoomState(
  roomCode: string,
): Promise<ActiveRoomRow | null> {
  try {
    const rows = await db
      .select()
      .from(activeRoomsTable)
      .where(eq(activeRoomsTable.roomCode, roomCode))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    logger.warn({ err, roomCode }, "loadRoomState failed");
    return null;
  }
}

/** Permanently remove an active_room row (e.g. on explicit cleanup). */
export async function deleteRoomState(roomCode: string): Promise<void> {
  try {
    await db
      .delete(activeRoomsTable)
      .where(eq(activeRoomsTable.roomCode, roomCode));
  } catch (err) {
    logger.warn({ err, roomCode }, "deleteRoomState failed");
  }
}

/**
 * Bulk TTL-expiry helper. Deletes rows that are past their retention
 * window. Phase 1 exports this for Phase 2's sweep to consume — it is NOT
 * called on a timer yet.
 *
 * Returns the number of rows deleted.
 */
export async function expireStaleRoomStates(now: Date = new Date()): Promise<number> {
  const gameOverCutoff = new Date(now.getTime() - TTL_GAME_OVER_MS);
  const waitingCutoff = new Date(now.getTime() - TTL_WAITING_IDLE_MS);
  const midGameCutoff = new Date(now.getTime() - TTL_MIDGAME_IDLE_MS);
  let deleted = 0;
  try {
    const a = await db
      .delete(activeRoomsTable)
      .where(
        and(
          eq(activeRoomsTable.phase, "game_over"),
          lt(activeRoomsTable.endedAt, gameOverCutoff),
        ),
      )
      .returning({ roomCode: activeRoomsTable.roomCode });
    deleted += a.length;
    const b = await db
      .delete(activeRoomsTable)
      .where(
        and(
          eq(activeRoomsTable.phase, "waiting"),
          lt(activeRoomsTable.updatedAt, waitingCutoff),
        ),
      )
      .returning({ roomCode: activeRoomsTable.roomCode });
    deleted += b.length;
    // Mid-game idle handling (forfeit + advance) is Phase 2 — for now we
    // surface candidates via a log so we can validate the cutoff in prod
    // before automating any state mutation.
    const c = await db
      .select({ roomCode: activeRoomsTable.roomCode })
      .from(activeRoomsTable)
      .where(lt(activeRoomsTable.updatedAt, midGameCutoff));
    if (c.length) {
      logger.info(
        { candidates: c.length },
        "Mid-game idle candidates (forfeit handler not wired until Phase 2)",
      );
    }
  } catch (err) {
    logger.warn({ err }, "expireStaleRoomStates failed");
  }
  return deleted;
}

/**
 * Append one row to the audit log. Never throws — audit failures must not
 * block gameplay. Callers should hash before and after the mutation and
 * pass both, so the row chains across actions in `(room_code, at)` order.
 */
export async function appendAuditLog(args: {
  roomCode: string | null;
  action: string;
  actorToken?: string | null;
  actorSeat?: number | null;
  payload?: unknown;
  prevStateHash?: string | null;
  newStateHash?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await db.insert(gameAuditLogTable).values({
      roomCode: args.roomCode,
      action: args.action,
      actorToken: args.actorToken ?? null,
      actorSeat: args.actorSeat ?? null,
      payload: (args.payload as Record<string, unknown> | null) ?? null,
      prevStateHash: args.prevStateHash ?? null,
      newStateHash: args.newStateHash ?? null,
      error: args.error ?? null,
    });
  } catch (err) {
    logger.warn(
      { err, action: args.action, roomCode: args.roomCode },
      "appendAuditLog failed",
    );
  }
}

// ── Per-room serial queue ────────────────────────────────────────────────
// Each room has a FIFO of pending mutation+persist operations. A handler
// acquires the lock for the WHOLE read→compute→commit→broadcast cycle so
// two concurrent handlers (e.g. both players acting at once) can never
// build on a stale snapshot.
//
// The queue degrades gracefully on errors: a failed fn does NOT poison the
// chain — the next caller still runs.

const roomLocks = new Map<string, Promise<unknown>>();

export async function withRoomLock<T>(
  roomCode: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = roomLocks.get(roomCode) ?? Promise.resolve();
  // Run fn whether prev resolved or rejected — keep the chain alive.
  const next = prev.then(fn, fn);
  // Store a swallowed-rejection version so awaiters down the chain don't crash.
  const handle = next.catch(() => undefined);
  roomLocks.set(roomCode, handle);
  try {
    return await next;
  } finally {
    // Identity-check cleanup: only drop the map entry if no newer caller has
    // already chained behind us. No await in finally — sync identity check
    // against the exact handle we stored avoids the false-positive race
    // where a still-pending tail gets evicted.
    if (roomLocks.get(roomCode) === handle) {
      roomLocks.delete(roomCode);
    }
  }
}

// ── Audit chain: track last persisted hash per room ─────────────────────
const lastHashByRoom = new Map<string, string>();

export function getLastHashFor(roomCode: string): string | null {
  return lastHashByRoom.get(roomCode) ?? null;
}
export function clearLastHashFor(roomCode: string): void {
  lastHashByRoom.delete(roomCode);
}

/**
 * Persist a state mutation + append a single audit row chained on the
 * room's previous hash. Resolves after BOTH writes complete — callers
 * `await` this so the next mutation on the same room (gated by
 * `withRoomLock`) cannot start until the DB is durable.
 *
 * On persist failure: logs loudly (via the inner helpers) and continues.
 * Live in-memory game state is the source of truth for the current process
 * — the DB write is a durability/audit concern. If you need hard "DB or
 * nothing" semantics, wrap your handler and roll back on a null return.
 */
export async function persistRoom(
  state: GameState,
  audit: {
    action: string;
    actorToken?: string | null;
    actorSeat?: number | null;
    payload?: unknown;
  },
): Promise<{ ok: boolean; newHash: string | null }> {
  const prevHash = lastHashByRoom.get(state.roomCode) ?? null;
  const newHash = await saveRoomState(state);
  if (newHash) {
    lastHashByRoom.set(state.roomCode, newHash);
  }
  await appendAuditLog({
    roomCode: state.roomCode,
    action: audit.action,
    actorToken: audit.actorToken ?? null,
    actorSeat: audit.actorSeat ?? null,
    payload: audit.payload ?? null,
    prevStateHash: prevHash,
    newStateHash: newHash,
    error: newHash ? null : "saveRoomState_failed",
  });
  return { ok: newHash !== null, newHash };
}

/**
 * One-shot mutation primitive: writes to the in-memory Map AND persists
 * AND audits, in that order. Call from inside `withRoomLock` to guarantee
 * per-room serial ordering.
 */
export async function commit(
  state: GameState,
  audit: {
    action: string;
    actorToken?: string | null;
    actorSeat?: number | null;
    payload?: unknown;
  },
): Promise<{ ok: boolean; newHash: string | null }> {
  updateRoom(state);
  return persistRoom(state, audit);
}

/** Delete audit-log rows older than the retention window. */
export async function expireOldAuditLogs(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TTL_AUDIT_LOG_MS);
  try {
    const rows = await db
      .delete(gameAuditLogTable)
      .where(lt(gameAuditLogTable.at, cutoff))
      .returning({ id: gameAuditLogTable.id });
    return rows.length;
  } catch (err) {
    logger.warn({ err }, "expireOldAuditLogs failed");
    return 0;
  }
}
