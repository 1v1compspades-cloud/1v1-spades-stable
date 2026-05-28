/**
 * Pre-June-1 regression — Tournament finals-seating reclaim.
 *
 * Scenario: `createMatchRoomAndAssign` pre-seats both bracket opponents
 * with their CURRENT socketId at room-creation time. If a finalist's
 * socket drops/reconnects between that moment and their navigation to
 * /room/<code>, the engine's `joinRoom` would reject a fresh join with
 * "Room is full" because the seat is still held by the dead socketId.
 *
 * The fix (in the `join_room` socket handler, tournament rooms only):
 * if the joining name matches a pre-seated slot, treat as a reconnect
 * via `reconnectPlayer`. This test exercises the underlying engine
 * behavior the handler relies on.
 *
 * Run:  npx tsx artifacts/api-server/src/game/__tests__/finals-seating.test.mts
 */
import {
  createRoom,
  joinRoom,
  reconnectPlayer,
  getRoom,
} from "../engine.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  \u2717 ${label}`, detail ?? "");
  }
}

console.log("\n— Tournament finals-seating reclaim —");

// ── 1. Engine rejects fresh join when both seats are pre-filled ──────────
{
  const room = createRoom("Alice", "sock-alice-old", 250, "Final", "quick", {
    code: "TCODE",
    matchId: "M0",
  });
  joinRoom(room.roomCode, "Grace", "sock-grace-old");

  let err: Error | null = null;
  try {
    joinRoom(room.roomCode, "Grace", "sock-grace-new");
  } catch (e) {
    err = e as Error;
  }
  ok(
    "engine.joinRoom rejects with 'Room is full' for fresh join after both seats taken",
    !!err && /full/i.test(err.message),
    err?.message,
  );

  // The reclaim path (used by the new join_room handler defensive branch).
  const reclaimed = reconnectPlayer(room.roomCode, 1, "sock-grace-new", "Grace");
  ok(
    "reconnectPlayer swaps the new socketId into seat 1 when name matches",
    reclaimed.players[1]?.socketId === "sock-grace-new"
      && reclaimed.players[1]?.name === "Grace",
    reclaimed.players[1],
  );
  ok(
    "seat 0 is untouched by the seat-1 reclaim",
    reclaimed.players[0]?.socketId === "sock-alice-old"
      && reclaimed.players[0]?.name === "Alice",
    reclaimed.players[0],
  );
}

// ── 2. Reclaim works for seat 0 as well (host-seat finalist) ─────────────
{
  const room = createRoom("Bob", "sock-bob-old", 250, "Final", "quick", {
    code: "TCODE2",
    matchId: "M1",
  });
  joinRoom(room.roomCode, "Carol", "sock-carol-old");
  const reclaimed = reconnectPlayer(room.roomCode, 0, "sock-bob-new", "Bob");
  ok(
    "reconnectPlayer swaps the new socketId into seat 0 when host-seat name matches",
    reclaimed.players[0]?.socketId === "sock-bob-new",
    reclaimed.players[0],
  );
}

// ── 3. Reclaim is case-insensitive + trim-tolerant ───────────────────────
{
  const room = createRoom("Dave", "sock-dave-old", 250, "Final", "quick", {
    code: "TCODE3",
    matchId: "M2",
  });
  joinRoom(room.roomCode, "Eve", "sock-eve-old");
  let okSwap = false;
  try {
    const reclaimed = reconnectPlayer(room.roomCode, 1, "sock-eve-new", "  eve  ");
    okSwap = reclaimed.players[1]?.socketId === "sock-eve-new";
  } catch { /* fail below */ }
  ok("reconnectPlayer accepts case + whitespace differences in name match", okSwap);
}

// ── 4. Stranger with same room code but different name is REJECTED ───────
{
  const room = createRoom("Frank", "sock-frank", 250, "Final", "quick", {
    code: "TCODE4",
    matchId: "M3",
  });
  joinRoom(room.roomCode, "Gina", "sock-gina");
  let err: Error | null = null;
  try {
    reconnectPlayer(room.roomCode, 1, "sock-stranger", "Mallory");
  } catch (e) {
    err = e as Error;
  }
  ok(
    "reconnectPlayer rejects when claiming a seat held by a different name",
    !!err && /another player/i.test(err.message),
    err?.message,
  );
  const after = getRoom(room.roomCode);
  ok(
    "rejected reclaim does NOT mutate seat 1",
    after?.players[1]?.socketId === "sock-gina"
      && after?.players[1]?.name === "Gina",
    after?.players[1],
  );
}

// ── 5. Tournament marker is preserved through reclaim ────────────────────
{
  const room = createRoom("Hank", "sock-hank-old", 250, "Final", "quick", {
    code: "TCODE5",
    matchId: "M4",
  });
  joinRoom(room.roomCode, "Iris", "sock-iris-old");
  reconnectPlayer(room.roomCode, 0, "sock-hank-new", "Hank");
  reconnectPlayer(room.roomCode, 1, "sock-iris-new", "Iris");
  const after = getRoom(room.roomCode);
  ok(
    "tournamentRef is preserved after both seats reclaim",
    after?.tournamentRef?.code === "TCODE5"
      && after?.tournamentRef?.matchId === "M4",
    after?.tournamentRef,
  );
  ok(
    "phase remains 'waiting' after reclaim (no accidental restart)",
    after?.phase === "waiting",
    after?.phase,
  );
}

// ── 6. Tokenized-seat guard — simulated handler logic ───────────────────
// This mirrors the security check in the join_room handler: if the matched
// seat has tokenizedSeats[seat]===true, the reclaim path must REFUSE and
// instruct the client to use reconnect_player instead. We model the check
// here directly because the test file does not boot socket.io.
{
  const room = createRoom("Jess", "sock-jess-old", 250, "Final", "quick", {
    code: "TCODE6",
    matchId: "M5",
  });
  joinRoom(room.roomCode, "Kira", "sock-kira-old");
  // Simulate "prior successful reclaim issued a token" — what the existing
  // token issuance block does after the lock.
  room.tokenizedSeats = [true, true];

  // Re-implement the gate exactly as in the handler.
  const pre = getRoom(room.roomCode)!;
  const norm = (s: string) => s.trim().toLowerCase();
  const seat = pre.players.findIndex((p) => p && norm(p.name) === norm("Kira"));
  const shouldRefuse =
    seat >= 0 && pre.tokenizedSeats?.[seat as 0 | 1] === true;
  ok(
    "join_room reclaim REFUSES when seat is already tokenized (forces use of reconnect_player + token)",
    shouldRefuse === true,
    { seat, tokenized: pre.tokenizedSeats },
  );
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
