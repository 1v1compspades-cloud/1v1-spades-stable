/**
 * Reconnect + websocket payload anti-cheat regressions.
 *
 * Run with: npx tsx artifacts/api-server/src/game/__tests__/reconnect-sanitization.test.mts
 */
import {
  addSpectator,
  createRoom,
  getRoom,
  joinRoom,
  reconnectPlayer,
  removePlayerFromRoom,
  startRound,
  updateRoom,
} from "../engine.js";
import {
  sanitizeStateForPlayer,
  sanitizeStateForSpectator,
  shouldRejectDuplicateReconnect,
} from "../socket.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}`, detail ?? "");
  }
}

function cardIds(cards: unknown): string[] {
  if (!Array.isArray(cards)) return [];
  return cards.map((card) => {
    const c = card as { suit?: string; rank?: string };
    return `${c.rank ?? "?"}-${c.suit ?? "?"}`;
  });
}

function hasPrivateHandsField(view: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(view, "hands");
}

function playerSeatsArePublic(view: Record<string, unknown>): boolean {
  if (!Array.isArray(view.players)) return false;
  return view.players.every((p) => {
    if (p === null) return true;
    const seat = p as Record<string, unknown>;
    return !Object.prototype.hasOwnProperty.call(seat, "socketId")
      && !Object.prototype.hasOwnProperty.call(seat, "id")
      && typeof seat.name === "string"
      && (seat.index === 0 || seat.index === 1);
  });
}

function createDealtRoom() {
  const room = createRoom("Seat One", `sock-host-${Date.now()}-${Math.random()}`);
  joinRoom(room.roomCode, "Seat Two", `sock-guest-${Date.now()}-${Math.random()}`);
  const dealt = startRound(room);
  updateRoom(dealt);
  return dealt;
}

console.log("\n— Reconnect + sanitized websocket payloads —");

// Seat 1 reconnect: restored seat receives only its own hand.
{
  const room = createDealtRoom();
  const hostHand = cardIds(room.hands[0]);
  const guestHand = cardIds(room.hands[1]);

  removePlayerFromRoom(room.players[0]!.socketId);
  const restored = reconnectPlayer(room.roomCode, 0, "sock-host-restored", "Seat One");
  const view = sanitizeStateForPlayer(restored, 0);
  const viewHand = cardIds(view.hand);

  ok("seat 1 reconnect restores player 1 socket", restored.players[0]?.socketId === "sock-host-restored");
  ok("seat 1 reconnect payload has no private hands field", !hasPrivateHandsField(view));
  ok("seat 1 reconnect payload redacts player socket ids", playerSeatsArePublic(view));
  ok("seat 1 reconnect payload includes own hand", viewHand.join("|") === hostHand.join("|"));
  ok("seat 1 reconnect payload does not include opponent hand", !guestHand.every((id) => viewHand.includes(id)));
}

// Seat 2 reconnect: restored seat receives only its own hand.
{
  const room = createDealtRoom();
  const hostHand = cardIds(room.hands[0]);
  const guestHand = cardIds(room.hands[1]);

  removePlayerFromRoom(room.players[1]!.socketId);
  const restored = reconnectPlayer(room.roomCode, 1, "sock-guest-restored", "Seat Two");
  const view = sanitizeStateForPlayer(restored, 1);
  const viewHand = cardIds(view.hand);

  ok("seat 2 reconnect restores player 2 socket", restored.players[1]?.socketId === "sock-guest-restored");
  ok("seat 2 reconnect payload has no private hands field", !hasPrivateHandsField(view));
  ok("seat 2 reconnect payload redacts player socket ids", playerSeatsArePublic(view));
  ok("seat 2 reconnect payload includes own hand", viewHand.join("|") === guestHand.join("|"));
  ok("seat 2 reconnect payload does not include opponent hand", !hostHand.every((id) => viewHand.includes(id)));
}

// Spectator join/reconnect views never include either private hand.
{
  const room = createDealtRoom();
  const withSpec = addSpectator(room.roomCode, "Watcher", "sock-spectator");
  const view = sanitizeStateForSpectator(withSpec);

  ok("spectator can join dealt room", withSpec.spectators.some((s) => s.socketId === "sock-spectator"));
  ok("spectator payload has no private hands field", !hasPrivateHandsField(view));
  ok("spectator payload redacts player socket ids", playerSeatsArePublic(view));
  ok("spectator payload has empty hand", Array.isArray(view.hand) && view.hand.length === 0);
  ok("spectator payload exposes only hand counts", JSON.stringify(view.handSizes) === JSON.stringify([13, 13]));
}

// Mobile Safari style refresh: disconnected old socket can reclaim the same seat.
{
  const room = createDealtRoom();
  const oldSocket = room.players[0]!.socketId;
  removePlayerFromRoom(oldSocket);
  const restored = reconnectPlayer(room.roomCode, 0, "sock-mobile-refresh", " Seat One ");
  const current = getRoom(room.roomCode);

  ok("mobile refresh restores original seat", restored.players[0]?.socketId === "sock-mobile-refresh");
  ok("mobile refresh does not swap opponent seat", current?.players[1]?.name === "Seat Two");
}

// Duplicate-tab guard: active socket cannot be silently replaced.
{
  ok(
    "duplicate-tab reconnect is rejected when current seat socket is still connected",
    shouldRejectDuplicateReconnect("sock-active", "sock-new-tab", true) === true,
  );
  ok(
    "same socket reconnect is allowed",
    shouldRejectDuplicateReconnect("sock-active", "sock-active", true) === false,
  );
  ok(
    "disconnected socket reconnect is allowed",
    shouldRejectDuplicateReconnect("sock-old", "sock-new", false) === false,
  );
}

// Duplicate plain-room join is blocked before a device can seat itself twice.
{
  const room = createRoom("Duplicate Name", `sock-dup-host-${Date.now()}-${Math.random()}`);
  let msg = "";
  try {
    joinRoom(room.roomCode, " duplicate   name ", "sock-dup-guest");
  } catch (e) {
    msg = (e as Error).message;
  }
  ok("duplicate display name cannot occupy opponent seat", /already seated/i.test(msg), msg);
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("Failures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
