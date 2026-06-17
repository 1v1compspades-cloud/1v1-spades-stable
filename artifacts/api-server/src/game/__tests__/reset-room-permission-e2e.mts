/**
 * Live-socket PERMISSION-ISOLATION test for the "Reset Room" destructive tool.
 *
 * Reset Room must be an ADMIN-ONLY (secret-key streamer/host) control. The
 * field report was that a normal seated room host / KotT King could still
 * trigger it. The server is the real boundary; this test calls the
 * `reset_room` socket event directly (bypassing the hidden button) and
 * asserts every non-admin caller is rejected, while the admin still succeeds.
 *
 * Covered:
 *   - Quick-match room creator (seat 0) reset_room is REJECTED.
 *   - KotT King (seat 0) reset_room is REJECTED.
 *   - KotT challenger (seat 1) reset_room is REJECTED.
 *   - Spectator reset_room is REJECTED.
 *   - Tournament player reset_room is REJECTED.
 *   - After admin_unlock, admin reset_room is ALLOWED (quick + KotT rooms).
 *
 * Requires the API Server workflow running + ADMIN_HOST_KEY in the env.
 * Run with:  npx tsx artifacts/api-server/src/game/__tests__/reset-room-permission-e2e.mts
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
  !!msg && /admin|host|authentication/i.test(msg);

type Ack = { ok: boolean; error?: string };

async function main() {
  if (!ADMIN_KEY) {
    console.log("  ✗ ADMIN_HOST_KEY not present in environment — cannot run reset-room permission e2e");
    process.exit(1);
  }

  const admin = await connect();
  const unlock = await emitAck(admin, "admin_unlock", { key: ADMIN_KEY });
  ok("admin_unlock succeeded", unlock.ok, unlock.error);

  // ── 1) QUICK MATCH ────────────────────────────────────────────────────────
  // Normal creator (seat 0) must NOT be able to reset; admin must be able to.
  {
    const host = await connect();
    const created = await emitAck<{ ok: boolean; roomCode?: string; error?: string }>(
      host, "create_room", { playerName: "Quick Host", mode: "quick" },
    );
    ok("quick: create_room succeeded", created.ok, created.error);
    const code = created.roomCode!;

    const r = await emitAck<Ack>(host, "reset_room", { roomCode: code });
    ok("quick: normal room creator reset_room REJECTED", !r.ok && isAuthError(r.error), r);

    const ra = await emitAck<Ack>(admin, "reset_room", { roomCode: code });
    ok("quick: admin reset_room ALLOWED", ra.ok, ra.error);

    host.close();
  }

  // ── 1b) GAMEPLAY GUARD: normal rematch (new_match) must STILL work ─────────
  // Locking reset_room to admin must NOT break the ordinary quick-match
  // "Start New Match" rematch, which is a normal seat-0 player action.
  {
    const host = await connect();
    const p2 = await connect();
    let phase = "";
    host.on("game_state", (st: { phase?: string }) => { if (st?.phase) phase = st.phase; });

    const created = await emitAck<{ ok: boolean; roomCode?: string; error?: string }>(
      host, "create_room", { playerName: "Rematch Host", mode: "quick" },
    );
    ok("rematch: create_room succeeded", created.ok, created.error);
    const code = created.roomCode!;
    await emitAck<Ack>(p2, "join_room", { roomCode: code, playerName: "Rematch P2" });
    await emitAck(host, "set_ready", { roomCode: code, ready: true }).catch(() => {});
    await emitAck(p2, "set_ready", { roomCode: code, ready: true }).catch(() => {});

    const startEnd = Date.now() + 10_000;
    let live = false;
    while (Date.now() < startEnd) {
      if (phase && phase !== "waiting") { live = true; break; }
      host.emit("start_game", { roomCode: code });
      await sleep(300);
    }
    ok("rematch: quick match started", live, phase);

    // Admin ends the match through the normal pipeline so we reach game_over.
    const ff = await emitAck<Ack>(admin, "fast_finish_match", { roomCode: code, winnerSeat: 0 });
    ok("rematch: admin fast_finish to game_over", ff.ok, ff.error);
    await sleep(400);
    ok("rematch: reached game_over", phase === "game_over", phase);

    // Non-admin seat-0 host triggers a rematch (new_match has no ack — observe
    // the state transition). This must succeed: gameplay is NOT admin-gated.
    phase = "";
    host.emit("new_match", { roomCode: code });
    const reEnd = Date.now() + 6000;
    let remade = false;
    while (Date.now() < reEnd) {
      if (phase === "coin_toss" || phase === "bidding") { remade = true; break; }
      await sleep(150);
    }
    ok("rematch: non-admin host new_match ALLOWED (gameplay preserved)", remade, phase);

    host.close(); p2.close();
  }

  // ── 2) KING OF THE TABLE ──────────────────────────────────────────────────
  // King (seat 0), challenger (seat 1), and a spectator must all be rejected.
  {
    const king = await connect();
    const challenger = await connect();
    const spectator = await connect();

    const created = await emitAck<{ ok: boolean; roomCode?: string; error?: string }>(
      king, "create_room", { playerName: "KotT King", mode: "king" },
    );
    ok("kott: create_room (king) succeeded", created.ok, created.error);
    const code = created.roomCode!;

    const cj = await emitAck<Ack>(challenger, "join_room", { roomCode: code, playerName: "KotT Challenger" });
    ok("kott: challenger join_room succeeded", cj.ok, cj);

    const sj = await emitAck<Ack>(spectator, "join_as_spectator", { roomCode: code, spectatorName: "KotT Watcher" });
    ok("kott: spectator join succeeded", sj.ok, sj);

    const rk = await emitAck<Ack>(king, "reset_room", { roomCode: code });
    ok("kott: seated King reset_room REJECTED", !rk.ok && isAuthError(rk.error), rk);

    const rc = await emitAck<Ack>(challenger, "reset_room", { roomCode: code });
    ok("kott: challenger reset_room REJECTED", !rc.ok && isAuthError(rc.error), rc);

    const rs = await emitAck<Ack>(spectator, "reset_room", { roomCode: code });
    ok("kott: spectator reset_room REJECTED", !rs.ok && isAuthError(rs.error), rs);

    const ra = await emitAck<Ack>(admin, "reset_room", { roomCode: code });
    ok("kott: admin reset_room ALLOWED", ra.ok, ra.error);

    king.close(); challenger.close(); spectator.close();
  }

  // ── 3) TOURNAMENT PLAYER ──────────────────────────────────────────────────
  // A seated tournament player must NOT be able to reset their match room.
  {
    const create = await emitAck<{ ok: boolean; code?: string; error?: string }>(
      admin, "create_tournament", { name: "Reset Perm Cup", size: 4 },
    );
    ok("tour: create_tournament succeeded", create.ok, create.error);
    const tcode = create.code!;

    // Four non-admin players join; capture one player's match_assigned roomCode.
    const players: Socket[] = [];
    let assignedRoom = "";
    let assignedSocket: Socket | null = null;
    for (let i = 0; i < 4; i++) {
      const p = await connect();
      p.on("match_assigned", (m: { roomCode?: string }) => {
        if (m?.roomCode && !assignedRoom) {
          assignedRoom = m.roomCode;
          assignedSocket = p;
        }
      });
      const j = await emitAck<Ack>(p, "join_tournament", { code: tcode, name: `TP${i + 1}` });
      ok(`tour: player ${i + 1} join_tournament succeeded`, j.ok, j.error);
      players.push(p);
    }

    const st = await emitAck<Ack>(admin, "start_tournament", { code: tcode });
    ok("tour: start_tournament succeeded", st.ok, st.error);

    // Wait for match_assigned to land a Round 1 room code on a player socket.
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline && !assignedRoom) await sleep(150);
    ok("tour: a player received a match room assignment", !!assignedRoom && !!assignedSocket, assignedRoom);

    if (assignedRoom && assignedSocket) {
      const rt = await emitAck<Ack>(assignedSocket, "reset_room", { roomCode: assignedRoom });
      ok("tour: tournament player reset_room REJECTED", !rt.ok && isAuthError(rt.error), rt);
    }

    for (const p of players) p.close();
  }

  admin.close();

  console.log("");
  console.log(`  Reset Room permission isolation: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("  Failures:");
    for (const f of failures) console.log(`    - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("  ✗ reset-room permission e2e crashed:", e);
  process.exit(1);
});
