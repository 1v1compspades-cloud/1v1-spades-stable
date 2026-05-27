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
}

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
  opts: { name?: string; size?: number; matchTarget?: number } = {}
): CreateTournamentResult {
  const size: TournamentSize =
    opts.size === 32 ? 32 :
    opts.size === 16 ? 16 :
    opts.size === 8 ? 8 : 4;
  const target = Number.isFinite(opts.matchTarget) && opts.matchTarget! > 0 && opts.matchTarget! <= 5000
    ? Math.floor(opts.matchTarget!)
    : 250;
  const name = (opts.name || "").trim().slice(0, 40) || `${hostName}'s Tournament`;

  let code: string;
  do { code = makeTournamentCode(); } while (tournaments.has(code));

  const hostToken = makeToken();
  const t: Tournament = {
    code,
    name,
    hostName,
    hostSocketId,
    size,
    matchTarget: target,
    status: "lobby",
    players: [{ id: hostSocketId, name: hostName, socketId: hostSocketId, token: hostToken }],
    rounds: [],
    champion: null,
    eliminated: [],
    createdAt: Date.now(),
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
  // Auth: either the caller's current socket matches the recorded host socket,
  // OR they present the host's secret token. Token wins because it survives
  // host refresh/reconnect (socketId can change).
  const hostPlayer = t.players.find(
    (p) => p.name.trim().toLowerCase() === t.hostName.trim().toLowerCase()
  );
  const tokenMatches = !!hostToken && !!hostPlayer && hostPlayer.token === hostToken;
  if (!tokenMatches && t.hostSocketId !== callerSocketId) {
    throw new Error("Only the host can start the tournament");
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

/**
 * Called from the socket layer when a tournament-linked game room reaches
 * game_over. Records the winner, advances the bracket, and reports
 * any newly-ready next-round matches so the caller can spin up their rooms.
 */
export function recordMatchResult(
  code: string,
  matchId: string,
  winnerSeat: BracketSeat
): MatchResultEffect {
  const t = tournaments.get(code);
  if (!t) throw new Error("Tournament not found");
  if (t.status !== "in_progress") throw new Error("Tournament not in progress");

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
  if (!resolved) throw new Error(`Bracket match ${matchId} not found`);
  if (resolved.winner) {
    // Idempotent re-call — return the existing state with no new effects.
    return {
      tournament: t,
      resolvedMatch: resolved,
      newlyReadyMatches: [],
      isFinal: resolvedRoundIdx === t.rounds.length - 1,
      championName: t.champion,
      loserName: null,
    };
  }

  const winnerName = winnerSeat === "A" ? resolved.playerA?.name : resolved.playerB?.name;
  const loserName  = winnerSeat === "A" ? resolved.playerB?.name : resolved.playerA?.name;
  if (!winnerName) throw new Error("Match has no winner-side player");

  resolved.winner = winnerSeat;
  resolved.winnerName = winnerName;
  if (loserName) t.eliminated.push(loserName);

  // Is this the final?
  const isFinal = resolvedRoundIdx === t.rounds.length - 1;
  if (isFinal) {
    t.status = "complete";
    t.champion = winnerName;
    return {
      tournament: t,
      resolvedMatch: resolved,
      newlyReadyMatches: [],
      isFinal: true,
      championName: winnerName,
      loserName: loserName ?? null,
    };
  }

  // Promote winner into the next round.
  const nextRound = t.rounds[resolvedRoundIdx + 1];
  const nextMatch = nextRound[Math.floor(resolvedPosition / 2)];
  // Pairs (0,1) feed slot A/B of nextMatch[0]; (2,3) → nextMatch[1]; etc.
  // Even position → playerA, odd position → playerB.
  if (resolvedPosition % 2 === 0) {
    nextMatch.playerA = { name: winnerName };
  } else {
    nextMatch.playerB = { name: winnerName };
  }

  const newlyReady: TournamentMatch[] = [];
  if (nextMatch.playerA && nextMatch.playerB && !nextMatch.roomCode) {
    newlyReady.push(nextMatch);
  }

  return {
    tournament: t,
    resolvedMatch: resolved,
    newlyReadyMatches: newlyReady,
    isFinal: false,
    championName: null,
    loserName: loserName ?? null,
  };
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
