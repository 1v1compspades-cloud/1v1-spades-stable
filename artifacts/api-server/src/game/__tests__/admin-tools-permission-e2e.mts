/**
 * Live-socket PERMISSION-ISOLATION test for admin/test tools.
 *
 * Proves the security boundary reported in the field: a normal seated player
 * (e.g. a KotT challenger opened in private Safari) must NOT be able to invoke
 * the host/admin test tools — neither by UI nor by a direct socket emit. The
 * server is the real boundary; this test calls the socket events directly.
 *
 * Covered:
 *   - A seated, non-admin player calling `fast_finish_match` is REJECTED.
 *   - A non-admin socket calling `admin_reset_table` is REJECTED.
 *   - A non-admin socket calling `admin_remove_from_queue` is REJECTED.
 *   - After `admin_unlock` (secret ADMIN_HOST_KEY), the SAME tools succeed
 *     (fast_finish ends the live match through the normal pipeline).
 *
 * Requires the API Server workflow running + ADMIN_HOST_KEY in the env.
 * Run with:  npx tsx artifacts/api-server/src/game/__tests__/admin-tools-permission-e2e.mts
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

const isAuthError = (msg?: string) =>
  !!msg && /admin|host|restricted|authentication/i.test(msg);

async function main() {
  if (!ADMIN_KEY) {
    console.log("  ✗ ADMIN_HOST_KEY not present in environment — cannot run permission e2e");
    process.exit(1);
  }

  // ── Two ordinary (non-admin) player sockets + one admin socket ──────────
  const p0 = await connect();
  const p1 = await connect();
  const admin = await connect();

  // Players watch game_state to know when the match leaves "waiting".
  let roomPhase = "";
  p0.on("game_state", (st: { roomCode?: string; phase?: string }) => {
    if (st?.phase) roomPhase = st.phase;
  });

  // p0 creates a King-of-the-Table room so the KotT admin tools are in scope.
  const created = await emitAck<{ ok: boolean; roomCode?: string; error?: string }>(
    p0, "create_room", { playerName: "Perm Host", mode: "king" },
  );
  ok("create_room (KotT) succeeded", created.ok, created.error);
  const code = created.roomCode!;
  if (!code) throw new Error("no room code");

  const joined = await emitAck(p1, "join_room", { roomCode: code, playerName: "Perm Challenger" });
  ok("challenger join_room succeeded", (joined as { ok: boolean }).ok, joined);

  await emitAck(p0, "set_ready", { roomCode: code, ready: true }).catch(() => {});
  await emitAck(p1, "set_ready", { roomCode: code, ready: true }).catch(() => {});

  // Start the match (start_game has no ack) and wait for it to leave waiting.
  const startEnd = Date.now() + 10_000;
  let live = false;
  while (Date.now() < startEnd) {
    if (roomPhase && roomPhase !== "waiting") { live = true; break; }
    p0.emit("start_game", { roomCode: code });
    await sleep(300);
  }
  ok("match started (left waiting)", live, roomPhase);

  // ── 1) Non-admin seated player CANNOT fast_finish ───────────────────────
  const ffP0 = await emitAck(p0, "fast_finish_match", { roomCode: code, winnerSeat: 0 });
  ok("seated player (host seat) fast_finish REJECTED", !ffP0.ok && isAuthError(ffP0.error), ffP0);

  const ffP1 = await emitAck(p1, "fast_finish_match", { roomCode: code, winnerSeat: 1 });
  ok("seated challenger fast_finish REJECTED", !ffP1.ok && isAuthError(ffP1.error), ffP1);

  // ── 2) Non-admin CANNOT use KotT admin tools ────────────────────────────
  const resetNA = await emitAck(p0, "admin_reset_table", { roomCode: code });
  ok("non-admin admin_reset_table REJECTED", !resetNA.ok && isAuthError(resetNA.error), resetNA);

  const rmNA = await emitAck(p1, "admin_remove_from_queue", { roomCode: code, socketId: "anything" });
  ok("non-admin admin_remove_from_queue REJECTED", !rmNA.ok && isAuthError(rmNA.error), rmNA);

  // Match must still be live — none of the blocked calls should have ended it.
  ok("match still live after blocked attempts", roomPhase !== "game_over", roomPhase);

  // ── 3) After admin_unlock, the SAME tool works ──────────────────────────
  const unlock = await emitAck(admin, "admin_unlock", { key: ADMIN_KEY });
  ok("admin_unlock succeeded", unlock.ok, unlock.error);

  const ffAdmin = await emitAck(admin, "fast_finish_match", { roomCode: code, winnerSeat: 0 });
  ok("admin fast_finish ALLOWED", ffAdmin.ok, ffAdmin.error);

  // Give the broadcast a beat, then confirm the match actually ended.
  await sleep(400);
  ok("match reached game_over via admin fast_finish", roomPhase === "game_over", roomPhase);

  p0.close(); p1.close(); admin.close();

  console.log("");
  console.log(`  Permission isolation: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("  ✗ permission e2e crashed:", e);
  process.exit(1);
});
