/**
 * Live-socket KING-OF-THE-TABLE security + rotation verification.
 *
 * Confirms, over the wire, the security boundary AND the normal KotT flow:
 *   SECURITY (server is the real boundary — these are direct socket emits):
 *     - A seated, non-admin CHALLENGER cannot fast_finish a live match.
 *     - A non-admin challenger cannot use ANY KotT admin tool
 *       (admin_reset_table / admin_remove_from_queue / admin_set_next_challenger).
 *     - A SPECTATOR cannot fast_finish and cannot use KotT admin tools.
 *     - None of the blocked calls end the live match.
 *     - No KotT game_state broadcast (player or spectator view) contains any
 *       token field (hostToken / adminToken / playerToken / any *token*).
 *   ROTATION (game logic unchanged — only driven by the admin test tool):
 *     - After admin ends the match with A winning, A is the match winner (King).
 *     - The losing challenger (B) can step down + rejoin the queue.
 *     - A fresh match is dealt automatically and B can win it to become King.
 *
 * Requires the API Server workflow running + ADMIN_HOST_KEY in the env.
 * Run with:  npx tsx artifacts/api-server/src/game/__tests__/kott-security-verify.mts
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
const isAuthError = (msg?: string) => !!msg && /admin|host|restricted|authentication/i.test(msg);

type Seat = { id?: string; name?: string; socketId?: string; index?: number } | null;
type KottState = {
  roomCode?: string;
  phase?: string;
  players?: Seat[];
  scores?: [number, number];
  kingStreak?: [number, number];
  challengerQueue?: { id: string; name: string }[];
};

async function main() {
  if (!ADMIN_KEY) {
    console.log("  ✗ ADMIN_HOST_KEY not present in environment — cannot run KotT verify");
    process.exit(1);
  }

  const A = await connect(); // King / host seat
  const B = await connect(); // Challenger
  const spec = await connect(); // Spectator
  const admin = await connect(); // Streamer/admin

  // Track latest state for our room from A's (player) and spec's (spectator) views.
  let aState: KottState = {};
  let specState: KottState = {};
  const playerBroadcasts: KottState[] = [];
  const specBroadcasts: KottState[] = [];
  let code = "";
  A.on("game_state", (st: KottState) => {
    if (code && st?.roomCode && st.roomCode !== code) return;
    aState = st;
    playerBroadcasts.push(st);
  });
  spec.on("game_state", (st: KottState) => {
    if (code && st?.roomCode && st.roomCode !== code) return;
    specState = st;
    specBroadcasts.push(st);
  });

  const waitPhase = async (pred: (p: string) => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (aState.phase && pred(aState.phase)) return true;
      await sleep(200);
    }
    return false;
  };

  // ── Setup: A creates KotT room, B joins as challenger, spec watches ──────
  const created = await emitAck<{ ok: boolean; roomCode?: string; error?: string }>(
    A, "create_room", { playerName: "King A", mode: "king" },
  );
  ok("create_room (KotT) succeeded", created.ok, created.error);
  code = created.roomCode!;
  if (!code) throw new Error("no room code");

  const joinedB = await emitAck(B, "join_room", { roomCode: code, playerName: "Challenger B" });
  ok("challenger B join_room succeeded", (joinedB as { ok: boolean }).ok, joinedB);

  const joinedSpec = await emitAck(spec, "join_as_spectator", { roomCode: code, name: "Watcher" });
  ok("spectator join_as_spectator succeeded", (joinedSpec as { ok: boolean }).ok, joinedSpec);

  await emitAck(A, "set_ready", { roomCode: code, ready: true }).catch(() => {});
  await emitAck(B, "set_ready", { roomCode: code, ready: true }).catch(() => {});

  // Start match (start_game has no ack) and wait until it leaves "waiting".
  const startEnd = Date.now() + 12_000;
  let live = false;
  while (Date.now() < startEnd) {
    if (aState.phase && aState.phase !== "waiting") { live = true; break; }
    A.emit("start_game", { roomCode: code });
    await sleep(300);
  }
  ok("match started (left waiting)", live, aState.phase);
  // If a coin toss precedes bidding, settle into a real playing/bidding phase.
  await waitPhase((p) => p === "bidding" || p === "playing", 8000);

  // ── SECURITY: challenger B cannot use the admin/test tools ──────────────
  const ffB = await emitAck(B, "fast_finish_match", { roomCode: code, winnerSeat: 1 });
  ok("challenger fast_finish REJECTED", !ffB.ok && isAuthError(ffB.error), ffB);

  const resetB = await emitAck(B, "admin_reset_table", { roomCode: code });
  ok("challenger admin_reset_table REJECTED", !resetB.ok && isAuthError(resetB.error), resetB);

  const rmB = await emitAck(B, "admin_remove_from_queue", { roomCode: code, socketId: "x" });
  ok("challenger admin_remove_from_queue REJECTED", !rmB.ok && isAuthError(rmB.error), rmB);

  const setNextB = await emitAck(B, "admin_set_next_challenger", { roomCode: code, socketId: "x" });
  ok("challenger admin_set_next_challenger REJECTED", !setNextB.ok && isAuthError(setNextB.error), setNextB);

  // ── SECURITY: spectator cannot use the admin/test tools ─────────────────
  const ffSpec = await emitAck(spec, "fast_finish_match", { roomCode: code, winnerSeat: 0 });
  ok("spectator fast_finish REJECTED", !ffSpec.ok && isAuthError(ffSpec.error), ffSpec);

  const resetSpec = await emitAck(spec, "admin_reset_table", { roomCode: code });
  ok("spectator admin_reset_table REJECTED", !resetSpec.ok && isAuthError(resetSpec.error), resetSpec);

  // None of the blocked calls may have ended the live match.
  ok("match still live after all blocked attempts", aState.phase !== "game_over", aState.phase);

  // ── SECURITY: no token leakage in any KotT broadcast ────────────────────
  const tokenLeak = (arr: KottState[]) =>
    arr.find((st) => /token/i.test(JSON.stringify(st)));
  ok("no token field in any PLAYER game_state broadcast", !tokenLeak(playerBroadcasts), tokenLeak(playerBroadcasts));
  ok("no token field in any SPECTATOR game_state broadcast", !tokenLeak(specBroadcasts), tokenLeak(specBroadcasts));
  ok(
    "challengerQueue entries expose only {id,name}",
    (aState.challengerQueue ?? []).every((c) => Object.keys(c).sort().join(",") === "id,name"),
    aState.challengerQueue,
  );

  // ── ROTATION: admin ends match with A (seat 0) winning ──────────────────
  const unlock = await emitAck(admin, "admin_unlock", { key: ADMIN_KEY });
  ok("admin_unlock succeeded", unlock.ok, unlock.error);

  const ffAwin = await emitAck(admin, "fast_finish_match", { roomCode: code, winnerSeat: 0 });
  ok("admin fast_finish (A wins) ALLOWED", ffAwin.ok, ffAwin.error);
  await waitPhase((p) => p === "game_over", 4000);
  ok("match reached game_over", aState.phase === "game_over", aState.phase);
  const s1 = aState.scores ?? [0, 0];
  ok("A (seat 0) is the match winner / King", s1[0] > s1[1], s1);

  // ── ROTATION: losing challenger B steps down + rejoins the queue ─────────
  const stepDown = await emitAck(B, "kott_step_down", { roomCode: code, rejoin: true });
  ok("loser B kott_step_down(rejoin) ALLOWED", (stepDown as { ok: boolean }).ok, stepDown);

  // A fresh match should be dealt automatically (rotation crowns B back in).
  const redealt = await waitPhase((p) => p === "bidding" || p === "playing", 12000);
  ok("fresh KotT match auto-dealt after rejoin", redealt, aState.phase);

  if (redealt) {
    // Find B's current seat from the live broadcast, then let B win it.
    const players = aState.players ?? [];
    const bSeat = players.findIndex((p) => p?.name === "Challenger B");
    ok("challenger B is re-seated for the next match", bSeat === 0 || bSeat === 1, players);
    if (bSeat === 0 || bSeat === 1) {
      const ffBwin = await emitAck(admin, "fast_finish_match", { roomCode: code, winnerSeat: bSeat as 0 | 1 });
      ok("admin fast_finish (B wins) ALLOWED", ffBwin.ok, ffBwin.error);
      await waitPhase((p) => p === "game_over", 4000);
      const s2 = aState.scores ?? [0, 0];
      ok("B becomes the match winner / new King", (s2[bSeat] ?? 0) > (s2[1 - bSeat] ?? 0), { s2, bSeat });
    }
  }

  A.close(); B.close(); spec.close(); admin.close();

  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  KotT SECURITY + ROTATION VERIFY: ${pass} passed, ${fail} failed`);
  console.log("════════════════════════════════════════════════════════════");
  if (fail > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("  ✗ kott-security-verify crashed:", e);
  process.exit(1);
});
