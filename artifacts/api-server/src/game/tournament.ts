/**
 * Custom Tournament — single-elimination bracket on top of the existing
 * 1v1 Spades engine. The tournament module is purely in-memory and
 * owns the lifecycle of a bracket: lobby → in_progress → complete.
 *
 * Round 1 rooms are created the moment the host hits start. For Round 2+,
 * rooms are created lazily as soon as both feeder matches resolve.
 *
 * Match rooms link back via `GameState.tournamentRef = { code, matchId }`
 * so the playCard handler can call `recordMatchResult` on game_over.
 */

export type TournamentStatus = "lobby" | "in_progress" | "complete";
export type TournamentSize = 4 | 8 | 16 | 32;
export type BracketSeat = "A" | "B";

export interface PendingAssignment {
  matchId: string;
  roomCode: string;
  playerIndex: 0 | 1;
  matchLabel: string;
  opponentName: string;
  /**
   * Per-seat reconnect token issued when the tournament match room is created.
   * Stored in the pendingAssignment so a refresh on the tournament page
   * re-delivers it via subscribe_tournament → match_assigned re-emit.
   * The client saves this to localStorage and presents it on reconnect_player,
   * closing the name-based seat-hijack path through join_room.
   */
  roomToken?: string;
}

export interface TournamentPlayer {
  id: string;
  name: string;
  socketId: string;
  /**
   * Per-player secret token issued at join time. Required for any subsequent
   * operation that re-attaches or asserts identity for this seat
   * (reconnects, host actions, etc.). Without this, anyone who knew a
   * participant's display name could hijack their seat.
   */
  token: string;
  /**
   * The most recent unfulfilled match_assigned for this player. Set when
   * a bracket match room is created for them; cleared when their next
   * match resolves. Re-emitted on a verified subscribe so a refresh on
   * the tournament page doesn't strand them.
   */
  pendingAssignment?: PendingAssignment;
}

export interface TournamentMatch {
  /** Stable identifier — `R<round>M<position>` (1-based round, 0-based position). */
  id: string;
  round: number;
  position: number;
  playerA: { name: string } | null;
  playerB: { name: string } | null;
  /** Set when the room is created for this match. */
  roomCode: string | null;
  /** Set when the match resolves. */
  winner: BracketSeat | null;
  /** Winner display name (denormalized for spectators). */
  winnerName: string | null;
  /** Final scores from the underlying game state, recorded on resolve.
   *  Display-only — never used for bracket logic. */
  scoreA: number | null;
  scoreB: number | null;
}

/**
 * Host admin audit entry — appended every time the tournament host takes
 * an administrative action (pause, resume, mark winner, force forfeit,
 * remake room, reset timer). The audit log is HOST-ONLY: it is never
 * included in `sanitizeTournament` and only reachable via the
 * `admin_audit_log` socket event, which itself requires the host token.
 *
 * In-memory only (bounded ring buffer, see TOURNAMENT_AUDIT_CAP). Bracket
 * advancements written by `recordMatchResult` are ALSO persisted to the
 * `game_audit_log` DB table by `recordMatchResultTx`, which is separate.
 */
export type AdminAuditAction =
  | "pause_match"
  | "resume_match"
  | "reset_timer"
  | "remake_room"
  | "mark_winner"
  | "force_forfeit"
  | "force_start"
  | "replace_player"
  | "reissue_token";

export interface AdminAuditEntry {
  ts: number;
  action: AdminAuditAction;
  /** Display name of the host who performed the action. */
  actorName: string;
  matchId?: string;
  roomCode?: string;
  /** Free-form per-action payload (winner seat, target seat, etc.). */
  payload?: Record<string, unknown>;
}

const TOURNAMENT_AUDIT_CAP = 500;

export interface Tournament {
  code: string;
  name: string;
  hostName: string;
  hostSocketId: string;
  size: TournamentSize;
  matchTarget: number;
  status: TournamentStatus;
  players: TournamentPlayer[];
  /** rounds[roundIdx] = ordered matches in that round. roundIdx is 0-based. */
  rounds: TournamentMatch[][];
  champion: string | null;
  /** Names of eliminated players, in elimination order. */
  eliminated: string[];
  createdAt: number;
  /** Set when status transitions to "complete" — used by the stale sweeper. */
  completedAt: number | null;
  /** Bounded ring buffer of host admin actions. Host-only via admin_audit_log. */
  adminAuditLog: AdminAuditEntry[];
}

const tournaments = new Map<string, Tournament>();

/** Cryptographically-strong per-player token. */
function makeToken(): string {
  // Use globalThis.crypto (available in Node 19+).
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback: 24 random hex chars.
  let out = "";
  for (let i = 0; i < 24; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Tournament codes use the same alphabet/length as room codes for consistency. */
function makeTournamentCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function getTournament(code: string): Tournament | undefined {
  return tournaments.get(code);
}

/** Iterate all live tournaments (used by the stale-tournament sweeper). */
export function getAllTournaments(): Tournament[] {
  return Array.from(tournaments.values());
}

export function deleteTournament(code: string): void {
  tournaments.delete(code);
}

export function getTournamentByMatchRoom(roomCode: string): { tournament: Tournament; match: TournamentMatch } | null {
  for (const t of tournaments.values()) {
    for (const round of t.rounds) {
      for (const m of round) {
        if (m.roomCode === roomCode) return { tournament: t, match: m };
      }
    }
  }
  return null;
}

export interface CreateTournamentResult {
  tournament: Tournament;
  /** Secret token to give back to the host so they can authenticate later. */
  hostToken: string;
}

export function createTournament(
  hostName: string,
  hostSocketId: string,
  opts: { name?: string; size?: number; matchTarget?: number; seedHost?: boolean } = {}
): CreateTournamentResult {
  const size: TournamentSize =
    opts.size === 32 ? 32 :
    opts.size === 16 ? 16 :
    opts.size === 8 ? 8 : 4;
  const target = Number.isFinite(opts.matchTarget) && opts.matchTarget! > 0 && opts.matchTarget! <= 5000
    ? Math.floor(opts.matchTarget!)
    : 250;
  // When seedHost is false (admin-created tournaments), the creator is NOT a
  // player and there is no "host" roster slot — every slot must be filled by an
  // explicit join. The tournament is gated entirely by the admin socket guard
  // server-side, never by an in-roster host identity.
  const seedHost = opts.seedHost !== false;
  const fallbackName = seedHost && hostName ? `${hostName}'s Tournament` : "Tournament";
  const name = (opts.name || "").trim().slice(0, 40) || fallbackName;

  let code: string;
  do { code = makeTournamentCode(); } while (tournaments.has(code));

  const hostToken = makeToken();
  const t: Tournament = {
    code,
    name,
    hostName: seedHost ? hostName : "",
    hostSocketId: seedHost ? hostSocketId : "",
    size,
    matchTarget: target,
    status: "lobby",
    players: seedHost
      ? [{ id: hostSocketId, name: hostName, socketId: hostSocketId, token: hostToken }]
      : [],
    rounds: [],
    champion: null,
    eliminated: [],
    createdAt: Date.now(),
    completedAt: null,
    adminAuditLog: [],
  };
  tournaments.set(code, t);
  return { tournament: t, hostToken };
}

export interface JoinTournamentResult {
  tournament: Tournament;
  /** Secret token to give back to the joiner. Required for later reconnects. */
  token: string;
  /** True if this was a brand-new join (vs. authenticated reconnect). */
  joinedFresh: boolean;
}

export function joinTournament(
  code: string,
  name: string,
  socketId: string,
  providedToken?: string
): JoinTournamentResult {
  const t = tournaments.get(code);
  if (!t) throw new Error("Tournament not found");
  if (t.status !== "lobby") throw new Error("Tournament already started");

  // Authenticated reconnect path: token + name must both match an existing player.
  if (providedToken) {
    const existing = t.players.find(
      (p) =>
        p.token === providedToken &&
        p.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    if (existing) {
      existing.socketId = socketId;
      existing.id = socketId;
      if (existing.socketId === t.hostSocketId || t.hostName.trim().toLowerCase() === existing.name.trim().toLowerCase()) {
        t.hostSocketId = socketId;
      }
      return { tournament: t, token: existing.token, joinedFresh: false };
    }
    // Token didn't match — fall through to fresh-join rules below.
  }

  // Fresh join: name must be unique (case-insensitively).
  const collision = t.players.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (collision) throw new Error("Name already taken in this tournament");
  if (t.players.length >= t.size) throw new Error("Tournament is full");

  const token = makeToken();
  t.players.push({ id: socketId, name: name.slice(0, 24), socketId, token });
  return { tournament: t, token, joinedFresh: true };
}

export interface ReplacePlayerResult {
  tournament: Tournament;
  /** New per-player token issued to the replacement. Returned to host so they
   *  can pass it (via a join link) to the actual backup person. NEVER goes
   *  into the sanitized tournament state. */
  newPlayerToken: string;
  /** Display name of the player who was removed (post-trim). */
  removedName: string;
  /** Display name of the replacement (post-trim/cap). */
  replacementName: string;
}

/**
 * Host-only pre-start replacement. Swap a registered player for a backup
 * while still in the lobby — preserves tournament size, keeps the slot
 * occupied, and issues a fresh token (the old token is invalidated).
 *
 * Throws "Tournament already started" if status !== "lobby".
 * Throws "Cannot replace the host" — host must cancel the tournament.
 * Throws "Player not found" / "Name already taken" with clear messaging.
 *
 * Auth: the caller MUST gate this with `requireTournamentHost(t, token)` —
 * this function does NOT re-check the host token itself.
 */
export function replacePlayer(
  code: string,
  oldName: string,
  newName: string,
): ReplacePlayerResult {
  const t = tournaments.get(code);
  if (!t) throw new Error("Tournament not found");
  if (t.status !== "lobby") {
    throw new Error("Cannot replace players after the tournament has started");
  }
  const oldKey = (oldName || "").trim().toLowerCase();
  if (!oldKey) throw new Error("Old player name is required");
  const newTrimmed = (newName || "").trim().slice(0, 24);
  if (!newTrimmed) throw new Error("Replacement name is required");
  const newKey = newTrimmed.toLowerCase();
  if (oldKey === t.hostName.trim().toLowerCase()) {
    throw new Error("Cannot replace the host");
  }
  const idx = t.players.findIndex(
    (p) => p.name.trim().toLowerCase() === oldKey,
  );
  if (idx < 0) throw new Error("Player not found in tournament");
  // Reject collision with ANY other slot (including the host).
  const collision = t.players.find(
    (p, i) => i !== idx && p.name.trim().toLowerCase() === newKey,
  );
  if (collision) throw new Error("Replacement name is already taken in this tournament");

  const removedName = t.players[idx].name;
  const token = makeToken();
  // Replace in-place — keeps roster order/index stable.
  t.players[idx] = {
    id: "",
    name: newTrimmed,
    socketId: "",
    token,
  };
  return { tournament: t, newPlayerToken: token, removedName, replacementName: newTrimmed };
}

export interface ReissueTokenResult {
  tournament: Tournament;
  /** Fresh per-player token. Returned to the admin ONLY so they can hand the
   *  player a one-time reconnect link. NEVER enters sanitized state. */
  playerToken: string;
  /** Display name of the player whose token was rotated (post-trim). */
  playerName: string;
}

/**
 * Admin-only mid-tournament reconnect recovery. Rotates an existing player's
 * per-player token (invalidating the old one) WITHOUT changing their name,
 * roster index, or in-flight match assignment. Use when a player lost their
 * browser / is on a new device and can no longer reattach to their seat.
 *
 * Unlike `replacePlayer`, this is allowed at ANY tournament status — the whole
 * point is to rescue a player who dropped during a live bracket.
 *
 * Only the `token` field is mutated; `pendingAssignment` (and everything else)
 * is preserved so the player's new link lands them back in their CURRENT match
 * via the normal `subscribe_tournament` → pending re-emit path.
 *
 * Throws "Tournament not found" / "Player not found in tournament".
 *
 * Auth: the caller MUST gate this with `requireAdmin(socket)` — this function
 * does NOT perform any authorization itself.
 */
export function reissuePlayerToken(
  code: string,
  playerName: string,
): ReissueTokenResult {
  const t = tournaments.get(code);
  if (!t) throw new Error("Tournament not found");
  const key = (playerName || "").trim().toLowerCase();
  if (!key) throw new Error("Player name is required");
  const p = t.players.find((p) => p.name.trim().toLowerCase() === key);
  if (!p) throw new Error("Player not found in tournament");
  const token = makeToken();
  // Rotate ONLY the token — keep name, roster index, and pendingAssignment so
  // the player's new reconnect link re-routes them into their live match.
  p.token = token;
  return { tournament: t, playerToken: token, playerName: p.name };
}

export function leaveTournament(code: string, socketId: string): Tournament | null {
  const t = tournaments.get(code);
  if (!t) return null;
  // Only allow leaving while in lobby — once started, leaving is a forfeit
  // and the player can still rejoin their assigned room.
  if (t.status !== "lobby") return t;
  // Host can't be removed by leave — they must cancel the tournament instead.
  if (socketId === t.hostSocketId) return t;
  const idx = t.players.findIndex((p) => p.socketId === socketId);
  if (idx >= 0) t.players.splice(idx, 1);
  return t;
}

/** Build an empty bracket of the right depth for the given size. */
function buildEmptyBracket(size: TournamentSize): TournamentMatch[][] {
  const rounds: TournamentMatch[][] = [];
  let count = size / 2;
  let r = 1;
  while (count >= 1) {
    const row: TournamentMatch[] = [];
    for (let p = 0; p < count; p++) {
      row.push({
        id: `R${r}M${p}`,
        round: r,
        position: p,
        playerA: null,
        playerB: null,
        roomCode: null,
        winner: null,
        winnerName: null,
        scoreA: null,
        scoreB: null,
      });
    }
    rounds.push(row);
    if (count === 1) break;
    count = count / 2;
    r++;
  }
  return rounds;
}

/** Fisher–Yates shuffle for seeding. */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Host action. Requires status=lobby + full roster. Seeds Round 1 randomly
 * and returns the tournament. The caller is responsible for creating the
 * Round 1 game rooms (one per match) and calling `attachRoomToMatch` for
 * each so the bracket records the room codes.
 */
export function startTournament(
  code: string,
  callerSocketId: string,
  hostToken?: string
): Tournament {
  const t = tournaments.get(code);
  if (!t) throw new Error("Tournament not found");
  if (t.status !== "lobby") throw new Error("Tournament already started");
  // Auth: for legacy/in-roster-host tournaments (hostName set), require either
  // the caller's current socket to match the recorded host socket OR the host's
  // secret token. Admin-created tournaments have NO host roster slot
  // (hostName === "") and are authorized entirely by the admin socket guard at
  // the call site, so this in-roster host check is skipped for them.
  if (t.hostName.trim() !== "") {
    const hostPlayer = t.players.find(
      (p) => p.name.trim().toLowerCase() === t.hostName.trim().toLowerCase()
    );
    const tokenMatches = !!hostToken && !!hostPlayer && hostPlayer.token === hostToken;
    if (!tokenMatches && t.hostSocketId !== callerSocketId) {
      throw new Error("Only the host can start the tournament");
    }
  }
  if (t.players.length !== t.size) {
    throw new Error(`Need ${t.size} players to start (currently ${t.players.length})`);
  }
  const seeded = shuffle(t.players);
  t.rounds = buildEmptyBracket(t.size);
  const round1 = t.rounds[0];
  for (let i = 0; i < round1.length; i++) {
    round1[i].playerA = { name: seeded[i * 2].name };
    round1[i].playerB = { name: seeded[i * 2 + 1].name };
  }
  t.status = "in_progress";
  return t;
}

/**
 * Look up which match a given player (by name) is currently in. Returns
 * the next un-played match they're assigned to. Useful for the "Go to
 * your match" CTA after they refresh.
 */
export function findActiveMatchForPlayer(t: Tournament, playerName: string): TournamentMatch | null {
  const n = playerName.trim().toLowerCase();
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.winner) continue;
      if (m.playerA?.name.trim().toLowerCase() === n) return m;
      if (m.playerB?.name.trim().toLowerCase() === n) return m;
    }
  }
  return null;
}

/** Wire a freshly-created game room to a bracket slot. */
export function attachRoomToMatch(
  code: string,
  matchId: string,
  roomCode: string
): Tournament {
  const t = tournaments.get(code);
  if (!t) throw new Error("Tournament not found");
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.id === matchId) {
        m.roomCode = roomCode;
        return t;
      }
    }
  }
  throw new Error(`Bracket match ${matchId} not found`);
}

export interface MatchResultEffect {
  tournament: Tournament;
  /** The bracket match that was just resolved. */
  resolvedMatch: TournamentMatch;
  /** Newly-created next-round matches now ready for room creation. */
  newlyReadyMatches: TournamentMatch[];
  /** True if this completes the tournament. */
  isFinal: boolean;
  /** Champion name when isFinal. */
  championName: string | null;
  /** Loser's name (eliminated). */
  loserName: string | null;
}

export type RecordMatchResolution =
  /** First-time recording — caller should fire side effects (broadcast, room creation). */
  | { kind: "advanced"; effect: MatchResultEffect }
  /** This exact (matchId, winner) was already recorded — caller MUST NOT re-fire side effects. */
  | { kind: "replay"; effect: MatchResultEffect }
  /** Result was refused — bracket was NOT mutated. */
  | {
      kind: "rejected";
      reason:
        | "not_found"
        | "wrong_phase"
        | "no_winner_player"
        | "winner_conflict"
        | "db_error";
      message: string;
    };

// ── Per-tournament serial lock ──────────────────────────────────────────
// `recordMatchResult` is the ONLY mutation that can advance a bracket.
// Wrapping every call in a per-tournament queue means two concurrent
// game_over events (or a game_over + a manual forfeit) for the same
// tournament serialize cleanly — no torn reads, no half-advanced bracket.
const tournamentLocks = new Map<string, Promise<unknown>>();
async function withTournamentLock<T>(
  code: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = tournamentLocks.get(code) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const handle = next.catch(() => undefined);
  tournamentLocks.set(code, handle);
  try {
    return await next;
  } finally {
    if (tournamentLocks.get(code) === handle) tournamentLocks.delete(code);
  }
}

/** Test-only: drain pending tournament locks. */
export async function flushTournamentLocks(): Promise<void> {
  const pending = Array.from(tournamentLocks.values());
  await Promise.allSettled(pending);
}

/**
 * Atomically record a match result. The full sequence — resolved-match
 * update, winner advancement into next round, loser elimination, and an
 * audit-log entry — is wrapped in a single DB transaction via
 * `recordMatchResultTx`. The in-memory bracket is snapshotted before
 * any mutation and restored on any failure, so a DB error or conflict
 * cannot leave a half-mutated bracket behind.
 *
 * Idempotency is enforced two ways:
 *   1. In-memory: if the match already has a `winner`, a same-winner call
 *      returns `kind: "replay"` with no DB write and no audit row.
 *   2. DB: `tournament_matches` row with non-null `winner_name` is
 *      detected inside the tx and short-circuits the second writer.
 *
 * Concurrency is serialized per-tournament so two simultaneous
 * `game_over` events for the same bracket cannot race.
 *
 * Pass an optional `roomCodeForAudit` when the resolved match's
 * `roomCode` field has already been cleared (e.g. forfeit before a room
 * existed) but you still want the audit row to reference a room.
 */
export async function recordMatchResult(
  code: string,
  matchId: string,
  winnerSeat: BracketSeat,
  opts: { roomCodeForAudit?: string | null; finalScores?: [number, number] } = {},
): Promise<RecordMatchResolution> {
  // Import lazily to avoid a circular dep with persistence.ts (which
  // imports from engine.ts which is in the same package).
  const { recordMatchResultTx } = await import("./persistence.js");
  const { logger } = await import("../lib/logger.js");

  return withTournamentLock(code, async () => {
    const t = tournaments.get(code);
    if (!t) {
      return {
        kind: "rejected",
        reason: "not_found",
        message: "Tournament not found",
      };
    }
    if (t.status !== "in_progress" && t.status !== "complete") {
      return {
        kind: "rejected",
        reason: "wrong_phase",
        message: `Tournament status is ${t.status}`,
      };
    }

    let resolved: TournamentMatch | null = null;
    let resolvedRoundIdx = -1;
    let resolvedPosition = -1;
    for (let r = 0; r < t.rounds.length; r++) {
      const idx = t.rounds[r].findIndex((m) => m.id === matchId);
      if (idx >= 0) {
        resolved = t.rounds[r][idx];
        resolvedRoundIdx = r;
        resolvedPosition = idx;
        break;
      }
    }
    if (!resolved) {
      return {
        kind: "rejected",
        reason: "not_found",
        message: `Bracket match ${matchId} not found`,
      };
    }
    const isFinal = resolvedRoundIdx === t.rounds.length - 1;

    // ── In-memory idempotency: same match, already decided ──────────
    if (resolved.winner) {
      if (resolved.winner === winnerSeat) {
        return {
          kind: "replay",
          effect: {
            tournament: t,
            resolvedMatch: resolved,
            newlyReadyMatches: [],
            isFinal,
            championName: t.champion,
            loserName: null,
          },
        };
      }
      return {
        kind: "rejected",
        reason: "winner_conflict",
        message: `Match ${matchId} already resolved with winner ${resolved.winner}; refused to overwrite with ${winnerSeat}`,
      };
    }

    const winnerName =
      winnerSeat === "A" ? resolved.playerA?.name : resolved.playerB?.name;
    const loserName =
      winnerSeat === "A" ? resolved.playerB?.name : resolved.playerA?.name;
    if (!winnerName) {
      return {
        kind: "rejected",
        reason: "no_winner_player",
        message: "Match has no winner-side player",
      };
    }

    // ── Snapshot every field we are about to mutate ─────────────────
    const snapshotRounds = structuredClone(t.rounds);
    const snapshotEliminated = [...t.eliminated];
    const snapshotStatus = t.status;
    const snapshotChampion = t.champion;
    const snapshotCompletedAt = t.completedAt;

    // ── Apply in-memory mutation ────────────────────────────────────
    resolved.winner = winnerSeat;
    resolved.winnerName = winnerName;
    if (opts.finalScores) {
      resolved.scoreA = opts.finalScores[0];
      resolved.scoreB = opts.finalScores[1];
    }
    if (loserName) t.eliminated.push(loserName);

    let newlyReady: TournamentMatch[] = [];
    if (isFinal) {
      t.status = "complete";
      t.completedAt = Date.now();
      t.champion = winnerName;
    } else {
      const nextMatch =
        t.rounds[resolvedRoundIdx + 1][Math.floor(resolvedPosition / 2)];
      if (resolvedPosition % 2 === 0) {
        nextMatch.playerA = { name: winnerName };
      } else {
        nextMatch.playerB = { name: winnerName };
      }
      if (nextMatch.playerA && nextMatch.playerB && !nextMatch.roomCode) {
        newlyReady = [nextMatch];
      }
    }

    // ── Commit to DB in a single transaction ────────────────────────
    const auditRoomCode =
      opts.roomCodeForAudit !== undefined
        ? opts.roomCodeForAudit
        : resolved.roomCode;
    const outcome = await recordMatchResultTx({
      tournamentCode: code,
      matchId,
      round: resolved.round,
      position: resolved.position,
      playerAName: resolved.playerA?.name ?? null,
      playerBName: resolved.playerB?.name ?? null,
      winnerName,
      roomCode: auditRoomCode,
      matchState: { ...resolved },
      auditPayload: {
        tournamentCode: code,
        tournamentName: t.name,
        matchId,
        round: resolved.round,
        position: resolved.position,
        winnerSeat,
        winnerName,
        loserName: loserName ?? null,
        isFinal,
        newlyReadyMatchIds: newlyReady.map((m) => m.id),
      },
    });

    // ── Rollback in-memory on any failure ───────────────────────────
    if (!outcome.ok) {
      t.rounds = snapshotRounds;
      t.eliminated = snapshotEliminated;
      t.status = snapshotStatus;
      t.champion = snapshotChampion;
      t.completedAt = snapshotCompletedAt;
      const detail =
        outcome.reason === "winner_conflict"
          ? `DB already has winner=${outcome.existingWinner}, refused to overwrite with ${outcome.attemptedWinner}`
          : outcome.message;
      logger.error(
        { code, matchId, reason: outcome.reason, detail },
        "Tournament bracket advancement aborted — in-memory state rolled back",
      );
      return { kind: "rejected", reason: outcome.reason, message: detail };
    }

    // First-time vs DB-replay (e.g. crash between DB commit and prior
    // in-memory apply): in both cases the live in-memory bracket has
    // ADVANCED for the first time in this process, so callers should
    // fire side effects. Audit-log row was only written on firstTime.
    if (!outcome.firstTime) {
      logger.info(
        { code, matchId, winnerName },
        "Tournament match was already recorded in DB — in-memory caught up without re-auditing",
      );
    }

    return {
      kind: "advanced",
      effect: {
        tournament: t,
        resolvedMatch: resolved,
        newlyReadyMatches: newlyReady,
        isFinal,
        championName: isFinal ? winnerName : null,
        loserName: loserName ?? null,
      },
    };
  });
}

/**
 * Refresh a player's socketId across a tournament — used when they reconnect
 * after a refresh / disconnect. Requires a matching per-player token so a
 * stranger who knows a participant's name cannot hijack their seat.
 *
 * Returns the player (with its pending assignment, if any) on success.
 * Returns null without mutating if the tournament is missing OR the
 * name/token pair doesn't match a known player.
 */
export function reattachPlayerSocket(
  code: string,
  playerName: string,
  token: string,
  newSocketId: string
): { tournament: Tournament; player: TournamentPlayer } | null {
  const t = tournaments.get(code);
  if (!t) return null;
  const n = playerName.trim().toLowerCase();
  const p = t.players.find((p) => p.name.trim().toLowerCase() === n && p.token === token);
  if (!p) return null;
  p.socketId = newSocketId;
  p.id = newSocketId;
  // Also refresh hostSocketId if this is the host — otherwise startTournament
  // by socketId would fail after host refresh.
  if (t.hostName.trim().toLowerCase() === n) {
    t.hostSocketId = newSocketId;
  }
  return { tournament: t, player: p };
}

/** Record a pending match assignment on a player for later re-delivery. */
export function setPendingAssignment(
  t: Tournament,
  playerName: string,
  pending: PendingAssignment
): void {
  const n = playerName.trim().toLowerCase();
  const p = t.players.find((p) => p.name.trim().toLowerCase() === n);
  if (p) p.pendingAssignment = pending;
}

/** Clear a player's pending assignment (call after their match resolves). */
export function clearPendingAssignment(t: Tournament, playerName: string): void {
  const n = playerName.trim().toLowerCase();
  const p = t.players.find((p) => p.name.trim().toLowerCase() === n);
  if (p) p.pendingAssignment = undefined;
}

/**
 * Permission gate for host-only admin actions. Returns the host player
 * record on success, throws "Only the tournament host can …" on failure.
 *
 * Why token-only (no socketId fallback like start_tournament):
 *   - Admin actions are higher-stakes than start (force-forfeit, mark
 *     winner, remake room) and must NEVER be triggerable just because
 *     the host's old socketId hasn't been recycled yet.
 *   - The token is the canonical durable identity; the host's browser
 *     stores it in localStorage and presents it on every admin event.
 */
export function requireTournamentHost(
  t: Tournament,
  providedToken: string | undefined,
): TournamentPlayer {
  if (!providedToken) {
    throw new Error("Only the tournament host can perform this action");
  }
  const hostPlayer = t.players.find(
    (p) => p.name.trim().toLowerCase() === t.hostName.trim().toLowerCase(),
  );
  if (!hostPlayer || hostPlayer.token !== providedToken) {
    throw new Error("Only the tournament host can perform this action");
  }
  return hostPlayer;
}

/**
 * Append an admin audit entry. Bounded — the oldest entries are dropped
 * once the cap is hit so a long-running tournament cannot leak memory.
 */
export function appendAdminAudit(
  t: Tournament,
  entry: Omit<AdminAuditEntry, "ts">,
): AdminAuditEntry {
  const full: AdminAuditEntry = { ...entry, ts: Date.now() };
  t.adminAuditLog.push(full);
  if (t.adminAuditLog.length > TOURNAMENT_AUDIT_CAP) {
    t.adminAuditLog.splice(0, t.adminAuditLog.length - TOURNAMENT_AUDIT_CAP);
  }
  return full;
}

/** Return the audit log tail (most recent first). Host-only by convention. */
export function getAdminAuditLog(
  t: Tournament,
  limit = 50,
): AdminAuditEntry[] {
  const out = t.adminAuditLog.slice(-limit).reverse();
  return out;
}

/**
 * Look up a bracket match by id without scanning callers. Returns null
 * (no throw) so callers can produce their own error messages.
 */
export function findMatchById(
  t: Tournament,
  matchId: string,
): TournamentMatch | null {
  for (const round of t.rounds) {
    for (const m of round) {
      if (m.id === matchId) return m;
    }
  }
  return null;
}

/**
 * Detach a bracket match from its current game room — clears `roomCode`
 * so a fresh `createMatchRoomAndAssign` call will spin up a new room.
 * Returns the old room code (if any) for the caller's audit/cleanup.
 */
export function detachMatchRoom(t: Tournament, matchId: string): string | null {
  const m = findMatchById(t, matchId);
  if (!m) return null;
  const old = m.roomCode;
  m.roomCode = null;
  return old;
}

export function getPlayerSocketIdByName(
  t: Tournament,
  playerName: string
): string | null {
  const n = playerName.trim().toLowerCase();
  const p = t.players.find((p) => p.name.trim().toLowerCase() === n);
  return p?.socketId ?? null;
}

/**
 * Public-facing tournament shape (drops socketIds). The bracket itself is
 * already public.
 */
export function sanitizeTournament(t: Tournament): Record<string, unknown> {
  return {
    code: t.code,
    name: t.name,
    hostName: t.hostName,
    size: t.size,
    matchTarget: t.matchTarget,
    status: t.status,
    players: t.players.map((p) => ({ id: p.id, name: p.name })),
    rounds: t.rounds,
    champion: t.champion,
    eliminated: t.eliminated,
    createdAt: t.createdAt,
  };
}
