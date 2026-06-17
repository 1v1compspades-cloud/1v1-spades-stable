/**
 * Live-socket END-TO-END tournament integration test.
 *
 * Unlike tournament-32-sim.mts (which calls the bracket mutator
 * `recordMatchResult` directly), this drives a real tournament entirely
 * through the Socket.io layer against the RUNNING API server:
 *
 *   admin_unlock → create_tournament → join_tournament ×4 →
 *   start_tournament → (per match) set_ready → start_game →
 *   fast_finish_match → advanceTournamentOnGameOver → lazy next-round
 *   room creation → match_assigned re-emit → … → tournament_complete
 *
 * This is the part the engine sim cannot cover: the game-over hook,
 * lazy creation of the finals room once both R1 feeders resolve,
 * match_assigned delivery, and the champion announcement — i.e. the
 * "complete from Round 1 through champion without manual intervention"
 * promise, proven on the real wire.
 *
 * Requires the API Server workflow to be running.
 * Run with:  npx tsx artifacts/api-server/src/game/__tests__/tournament-socket-e2e.mts
 */
import { io, type Socket } from "socket.io-client";

const URL = "http://localhost:80";
const PATH = "/socket.io";
const ADMIN_KEY = process.env.ADMIN_HOST_KEY;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""));
    console.log(`  ✗ ${label}`, detail ?? "");
  }
}

function hasTokenLeak(obj: unknown): boolean {
  let leaked = false;
  const walk = (v: unknown) => {
    if (leaked || v === null || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/token/i.test(k) && val != null && val !== "") {
        leaked = true;
        return;
      }
      walk(val);
    }
  };
  walk(obj);
  return leaked;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function connect(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(URL, { path: PATH, transports: ["websocket"], reconnection: false, timeout: 8000 });
    s.on("connect", () => resolve(s));
    s.on("connect_error", (e) => reject(e));
    setTimeout(() => reject(new Error("connect timeout")), 9000);
  });
}
function emitAck<T = { ok: boolean; error?: string }>(s: Socket, ev: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`${ev} ack timeout`)), 8000);
    s.emit(ev, payload, (res: T) => {
      clearTimeout(to);
      resolve(res);
    });
  });
}

type MatchAssigned = { tournamentCode: string; matchId: string; roomCode: string; playerIndex: number };

async function main() {
  if (!ADMIN_KEY) {
    console.log("  ✗ ADMIN_HOST_KEY not present in environment — cannot run socket e2e");
    process.exit(1);
  }

  const SIZE = 32;
  const EXPECTED_MATCHES = SIZE - 1; // 32 players → 31 matches (16+8+4+2+1)
  const PLAYER_NAMES = Array.from({ length: SIZE }, (_, i) => `E2E P${i + 1}`);

  // ── admin socket: create + start + observe ──────────────────────────────
  const admin = await connect();
  const adminRes = await emitAck<{ ok: boolean; error?: string }>(admin, "admin_unlock", { key: ADMIN_KEY });
  ok("admin_unlock succeeded", adminRes.ok, adminRes.error);
  if (!adminRes.ok) throw new Error("admin unlock failed");

  let completeChampion: string | null = null;
  let lastTournamentState: Record<string, unknown> | null = null;
  let tokenLeakInBroadcast = false;
  let fastFinishOk = 0;
  const playedRooms = new Set<string>();

  admin.on("tournament_complete", (p: { champion: string }) => {
    completeChampion = p.champion;
  });
  admin.on("tournament_state", (st: Record<string, unknown>) => {
    lastTournamentState = st;
    if (hasTokenLeak(st)) tokenLeakInBroadcast = true;
  });

  const createRes = await emitAck<{ ok: boolean; code?: string; error?: string }>(admin, "create_tournament", {
    name: "E2E Socket Tournament",
    size: SIZE,
    matchTarget: 250,
  });
  ok("create_tournament succeeded", createRes.ok && !!createRes.code, createRes.error);
  const code = createRes.code!;

  // Live phase per room, fed by game_state broadcasts to seated players.
  const roomPhase = new Map<string, string>();
  const finishingRooms = new Set<string>();

  // Alternate the winning seat across the bracket so BOTH seat-0 and seat-1
  // wins traverse the real game-over → advancement path (not just seat 0).
  const winnerSeatFor = (matchId: string): 0 | 1 => {
    const mm = /R(\d+)M(\d+)/.exec(matchId);
    if (!mm) return 0;
    return ((Number(mm[1]) + Number(mm[2])) % 2) as 0 | 1;
  };

  const waitFor = async (pred: () => boolean, timeoutMs: number, stepMs = 120): Promise<boolean> => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (pred()) return true;
      await sleep(stepMs);
    }
    return pred();
  };

  // ── player sockets: join + auto-drive their assigned matches ────────────
  const players: Socket[] = [];
  const driveMatch = async (sock: Socket, m: MatchAssigned) => {
    if (m.tournamentCode !== code) return;
    playedRooms.add(m.roomCode);
    // Both seats mark ready. Only seat 0 starts + finishes the match so two
    // sockets don't race on start_game / fast_finish.
    await emitAck(sock, "set_ready", { roomCode: m.roomCode, ready: true }).catch(() => {});
    if (m.playerIndex !== 0) return;
    if (finishingRooms.has(m.roomCode)) return; // ignore a re-emitted assignment
    finishingRooms.add(m.roomCode);
    // start_game has NO ack callback, so don't wait on one. Fire it and watch
    // game_state.phase flip out of "waiting"; retry until both seats are ready
    // and the coin toss begins (event-driven, not a fixed sleep).
    const started = await waitFor(() => {
      const ph = roomPhase.get(m.roomCode);
      if (ph && ph !== "waiting") return true;
      sock.emit("start_game", { roomCode: m.roomCode });
      return false;
    }, 10_000);
    if (!started) {
      ok(`start_game advanced ${m.matchId} out of waiting`, false, roomPhase.get(m.roomCode));
      return;
    }
    const winnerSeat = winnerSeatFor(m.matchId);
    // fast_finish_match is ADMIN-ONLY — drive it from the unlocked admin socket,
    // never a player socket. (Admins are exempt from the seated-in-room check
    // and routinely finish bracket rooms from the side.) Every match in this
    // test funnels through the single admin socket; the server's per-socket rate
    // cap (60/60s) is sized to clear a full bracket, so no backoff is needed.
    const res = await emitAck<{ ok: boolean; error?: string }>(admin, "fast_finish_match", {
      roomCode: m.roomCode,
      winnerSeat,
    }).catch((e) => ({ ok: false, error: String(e) }));
    if (res.ok) fastFinishOk++;
    else ok(`fast_finish for ${m.matchId} (${m.roomCode})`, false, res.error);
  };

  // Connect + join all players in parallel for speed.
  await Promise.all(
    Array.from({ length: SIZE }, (_, i) =>
      (async () => {
        const sock = await connect();
        sock.on("match_assigned", (m: MatchAssigned) => void driveMatch(sock, m));
        sock.on("game_state", (st: { roomCode?: string; phase?: string }) => {
          if (st?.roomCode && st.phase) roomPhase.set(st.roomCode, st.phase);
        });
        const jr = await emitAck<{ ok: boolean; error?: string }>(sock, "join_tournament", {
          code,
          name: PLAYER_NAMES[i],
        });
        ok(`player ${i + 1} joined`, jr.ok, jr.error);
        players.push(sock);
      })(),
    ),
  );

  // ── start it — Round 1 rooms get created + match_assigned fired ─────────
  const startRes = await emitAck<{ ok: boolean; error?: string }>(admin, "start_tournament", { code });
  ok("start_tournament succeeded", startRes.ok, startRes.error);

  // ── wait for the whole bracket to auto-resolve to a champion ────────────
  const deadline = Date.now() + 90_000;
  while (!completeChampion && Date.now() < deadline) {
    await sleep(250);
  }
  await sleep(400); // let the final complete-state broadcast settle

  ok("tournament_complete announced a champion", !!completeChampion, completeChampion);
  ok(`all ${EXPECTED_MATCHES} matches reached game_over (fast_finish ok)`, fastFinishOk === EXPECTED_MATCHES, fastFinishOk);
  ok(`distinct rooms created == ${EXPECTED_MATCHES} (R1 + every lazily-created later round)`, playedRooms.size === EXPECTED_MATCHES, playedRooms.size);
  ok("no token leaked in any tournament_state broadcast to subscribers", !tokenLeakInBroadcast);

  const st = lastTournamentState as Record<string, unknown> | null;
  ok("final broadcast status == complete", !!st && st.status === "complete", st?.status);
  ok("final broadcast champion matches complete event", !!st && st.champion === completeChampion, {
    broadcast: st?.champion,
    event: completeChampion,
  });
  const elim = (st?.eliminated as string[] | undefined) ?? [];
  ok(`final broadcast eliminated count == ${SIZE - 1}`, elim.length === SIZE - 1, elim.length);
  ok("champion not in eliminated list", !!completeChampion && !elim.includes(completeChampion));
  const rounds = (st?.rounds as unknown[][] | undefined) ?? [];
  const expectedShape: number[] = [];
  for (let n = SIZE / 2; n >= 1; n = Math.floor(n / 2)) expectedShape.push(n);
  ok(
    `bracket shape is [${expectedShape.join(",")}]`,
    rounds.length === expectedShape.length && rounds.every((r, i) => r.length === expectedShape[i]),
    rounds.map((r) => r.length),
  );

  // Winner-identity progression on the LIVE pipeline: every match's winnerName
  // (set by advanceTournamentOnGameOver from real scores) must occupy the
  // correct next-round slot — seat A for even position, B for odd. Because the
  // driver alternates the winning seat, this exercises BOTH seat-0 and seat-1
  // wins traversing the real game-over → bracket-advance path.
  type RM = { playerA?: { name?: string }; playerB?: { name?: string }; winnerName?: string };
  let progressionOk = true;
  let progressionDetail: unknown = null;
  for (let r = 0; r < rounds.length - 1 && progressionOk; r++) {
    for (let p = 0; p < rounds[r].length; p++) {
      const m = rounds[r][p] as RM;
      const next = rounds[r + 1][Math.floor(p / 2)] as RM;
      const slot = p % 2 === 0 ? next.playerA : next.playerB;
      if (!m.winnerName || slot?.name !== m.winnerName) {
        progressionOk = false;
        progressionDetail = { round: r + 1, pos: p, winner: m.winnerName, landedIn: slot?.name };
        break;
      }
    }
  }
  ok("every winner advanced to the correct next-round slot (live pipeline)", progressionOk, progressionDetail);
  const finalsWinner = (rounds[rounds.length - 1]?.[0] as RM | undefined)?.winnerName;
  ok("finals winnerName equals the champion", finalsWinner === completeChampion, { finalsWinner, completeChampion });

  // ── report ──────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  LIVE-SOCKET TOURNAMENT E2E REPORT");
  console.log("═".repeat(60));
  console.log(`  Tournament code    : ${code}`);
  console.log(`  Players (sockets)  : ${SIZE}`);
  console.log(`  Matches expected   : ${EXPECTED_MATCHES}`);
  console.log(`  Matches finished   : ${fastFinishOk}`);
  console.log(`  Distinct rooms     : ${playedRooms.size}`);
  console.log(`  CHAMPION           : 🏆 ${completeChampion}`);
  console.log(`  Assertions passed  : ${pass}`);
  console.log(`  Assertions failed  : ${fail}`);
  if (failures.length) {
    console.log("\n  FAILED ASSERTIONS:");
    for (const f of failures) console.log(`    ✗ ${f}`);
  }
  console.log("═".repeat(60));

  admin.disconnect();
  for (const p of players) p.disconnect();

  const passed =
    fail === 0 && !!completeChampion && fastFinishOk === EXPECTED_MATCHES && playedRooms.size === EXPECTED_MATCHES;
  console.log(`\n  RESULT: ${passed ? "PASS ✓ — bracket auto-completed to a champion over the wire" : "FAIL ✗"}\n`);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
