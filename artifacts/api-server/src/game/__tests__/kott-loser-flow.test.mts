import { strict as assert } from "node:assert";
import {
  createRoom,
  joinRoom,
  getRoom,
  addChallenger,
  promoteNextChallenger,
  canKottStepDown,
  type GameState,
} from "../engine.js";

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

// Build a finished KotT match: seat 0 (King) beat seat 1 (loser), no challenger
// queued. This is the exact state both players sit in at game_over before the
// loser acts (kott_step_down).
function finishedKottMatch(): GameState {
  const state = createRoom("Alice", "sock_alice", 250, undefined, "king");
  joinRoom(state.roomCode, "Bob", "sock_bob");
  const s = getRoom(state.roomCode)!;
  s.phase = "game_over";
  s.scores = [251, 130]; // seat 0 wins decisively
  s.kingStreak = [0, 0];
  return s;
}

// Mirror what the socket handler does when the loser steps down: move them to
// spectators and vacate their seat. (rejoin also calls addChallenger.)
function stepDownLoser(s: GameState, loserSeat: 0 | 1) {
  const loser = s.players[loserSeat]!;
  if (!s.spectators.some((sp) => sp.socketId === loser.socketId)) {
    s.spectators.push({ id: loser.socketId, name: loser.name, socketId: loser.socketId });
  }
  s.players[loserSeat] = null;
}

console.log("── KotT losing-player post-match flow ──");

test("Rejoin Queue: loser steps down + re-queues → re-seated for a rematch, King streak +1 (single bump)", () => {
  const s = finishedKottMatch();
  const code = s.roomCode;

  // Loser (seat 1) taps "Rejoin Queue".
  stepDownLoser(s, 1);
  addChallenger(code, "Bob", "sock_bob");

  assert.equal(s.players[0]?.socketId, "sock_alice", "King keeps their seat");
  assert.equal(s.players[1], null, "Loser seat is vacated before rotation");
  assert.equal(s.challengerQueue.length, 1, "Loser is now in the challenger queue");

  const promo = promoteNextChallenger(code);
  assert.ok(promo, "rotation promotes the queued challenger");
  const after = getRoom(code)!;
  assert.equal(after.players[0]?.socketId, "sock_alice", "King still seated after rematch setup");
  assert.equal(after.players[1]?.socketId, "sock_bob", "Loser is re-seated as the challenger");
  assert.equal(after.kingStreak[0], 1, "King streak bumped exactly once (no double-bump)");
  assert.equal(after.kingStreak[1], 0, "Challenger seat streak reset to 0");
  assert.equal(after.challengerQueue.length, 0, "Queue drained after promotion");
});

test("Back to Lobby: loser steps down (no re-queue) → King alone at game_over, recoverable by a NEW challenger", () => {
  const s = finishedKottMatch();
  const code = s.roomCode;

  // Loser (seat 1) taps "Back to King of the Table Lobby".
  stepDownLoser(s, 1);

  assert.equal(s.players[0]?.socketId, "sock_alice", "King keeps their seat");
  assert.equal(s.players[1], null, "Loser seat vacated");
  assert.ok(s.spectators.some((sp) => sp.socketId === "sock_bob"), "Loser is now a spectator (can re-queue)");
  assert.equal(s.challengerQueue.length, 0, "No one queued yet — King is waiting");
  assert.equal(s.phase, "game_over", "Phase stays game_over so the queue→promote path stays valid");

  // A different challenger arrives via the existing queue path.
  addChallenger(code, "Carol", "sock_carol");
  const promo = promoteNextChallenger(code);
  assert.ok(promo, "King-alone-at-game_over + challenger → rotation works (null-seat branch)");
  const after = getRoom(code)!;
  assert.equal(after.players[0]?.socketId, "sock_alice", "King still seated");
  assert.equal(after.players[1]?.socketId, "sock_carol", "New challenger seated in the empty seat");
  assert.equal(after.kingStreak[0], 1, "King streak bumped once for holding the table");
});

test("Loser who steps down can themselves re-queue later (return to lobby AND rejoin)", () => {
  const s = finishedKottMatch();
  const code = s.roomCode;

  stepDownLoser(s, 1); // Back to lobby — now a spectator.
  // Later the same loser taps "Join as Challenger" from the spectator view.
  addChallenger(code, "Bob", "sock_bob");
  assert.equal(s.challengerQueue.length, 1, "Stepped-down loser can rejoin the queue");

  const promo = promoteNextChallenger(code);
  assert.ok(promo, "their rejoin triggers a rematch");
  assert.equal(getRoom(code)!.players[1]?.socketId, "sock_bob", "loser re-seated");
});

console.log("\n── KotT step-down authorization (canKottStepDown) ──");

test("loser (lower-score seat) is allowed to step down", () => {
  const s = finishedKottMatch(); // seat 0 = 251, seat 1 = 130
  const g = canKottStepDown(s, "sock_bob");
  assert.ok(g.ok, "loser may step down");
  if (g.ok) assert.equal(g.loserSeat, 1, "loser seat resolved to 1");
});

test("winner (higher-score seat) is REJECTED — cannot crown the loser by vacating", () => {
  const s = finishedKottMatch();
  const g = canKottStepDown(s, "sock_alice");
  assert.equal(g.ok, false, "winner is blocked");
});

test("non-seated socket is REJECTED", () => {
  const s = finishedKottMatch();
  const g = canKottStepDown(s, "sock_random");
  assert.equal(g.ok, false, "stranger is blocked");
});

test("rejected before game_over (mid-match)", () => {
  const s = finishedKottMatch();
  s.phase = "playing";
  const g = canKottStepDown(s, "sock_bob");
  assert.equal(g.ok, false, "cannot step down mid-match");
});

test("rejected on a tied score (no decisive loser)", () => {
  const s = finishedKottMatch();
  s.scores = [200, 200];
  const g = canKottStepDown(s, "sock_bob");
  assert.equal(g.ok, false, "draws have no loser to step down");
});

test("rejected in non-king (quick) mode", () => {
  const q = createRoom("Al", "sock_q0", 250, undefined, "quick");
  joinRoom(q.roomCode, "Bo", "sock_q1");
  const s = getRoom(q.roomCode)!;
  s.phase = "game_over";
  s.scores = [251, 100];
  const g = canKottStepDown(s, "sock_q1");
  assert.equal(g.ok, false, "step-down is KotT-only");
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
