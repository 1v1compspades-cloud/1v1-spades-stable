/**
 * v1.1 Find Match MVP server-queue tests.
 *
 * Runs without public UI and without a live socket server:
 *   corepack pnpm --filter @workspace/api-server exec tsx src/game/__tests__/find-matchmaking.test.mts
 */
import { FindMatchQueue, type FindMatchMatchedPayload } from "../findMatchmaking.ts";

type EventRecord = { event: string; payload: unknown };

class FakeSocket {
  readonly id: string;
  readonly events: EventRecord[] = [];

  constructor(id: string) {
    this.id = id;
  }

  emit(event: string, payload: unknown): void {
    this.events.push({ event, payload });
  }
}

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function last(socket: FakeSocket, event: string): unknown {
  return socket.events.filter((entry) => entry.event === event).at(-1)?.payload;
}

function matched(roomCode: string, playerIndex: 0 | 1): FindMatchMatchedPayload {
  return {
    roomCode,
    playerIndex,
    token: `token-${playerIndex}`,
    route: `/room/${roomCode}`,
  };
}

async function testFlagOffRejects() {
  const socket = new FakeSocket("s-off");
  const queue = new FindMatchQueue<FakeSocket>({
    isEnabled: () => false,
    timeoutMs: () => 50,
    matchPlayers: async () => [matched("NOPE", 0), matched("NOPE", 1)],
  });

  await queue.join({ socket, playerName: "Guest One", profileUsername: null });
  const payload = last(socket, "find_match_error") as { code?: string } | undefined;
  ok("flag off rejects matchmaking", payload?.code === "disabled", payload);
}

async function testFirstPlayerWaitsAndDuplicateIsIdempotent() {
  const socket = new FakeSocket("s-wait");
  const counts: number[] = [];
  const queue = new FindMatchQueue<FakeSocket>({
    isEnabled: () => true,
    timeoutMs: () => 1_000,
    matchPlayers: async () => [matched("ROOM1", 0), matched("ROOM1", 1)],
    onWaitingCountChange: (count) => counts.push(count),
  });

  await queue.join({ socket, playerName: "Guest One", profileUsername: null });
  await queue.join({ socket, playerName: "Guest One", profileUsername: null });
  const waits = socket.events.filter((entry) => entry.event === "find_match_waiting");
  ok("first player waits", waits.length === 2, waits);
  ok("duplicate queue from same socket is idempotent", queue.hasWaitingSocket(socket.id));
  ok("finding match count increments only once for duplicate join", counts.join(",") === "1", counts);
  queue.cancel(socket);
}

async function testSecondPlayerMatches() {
  const first = new FakeSocket("s-first");
  const second = new FakeSocket("s-second");
  const counts: number[] = [];
  const queue = new FindMatchQueue<FakeSocket>({
    isEnabled: () => true,
    timeoutMs: () => 1_000,
    onWaitingCountChange: (count) => counts.push(count),
    matchPlayers: async (a, b) => {
      ok("match callback receives first queued player first", a.socket.id === first.id, a.socket.id);
      ok("match callback receives second player second", b.socket.id === second.id, b.socket.id);
      return [matched("ABCD12", 0), matched("ABCD12", 1)];
    },
  });

  await queue.join({ socket: first, playerName: "Guest One", profileUsername: null });
  await queue.join({ socket: second, playerName: "Guest Two", profileUsername: null });

  const firstMatch = last(first, "find_match_matched") as FindMatchMatchedPayload | undefined;
  const secondMatch = last(second, "find_match_matched") as FindMatchMatchedPayload | undefined;
  ok("first matched receives room and seat 0", firstMatch?.roomCode === "ABCD12" && firstMatch.playerIndex === 0, firstMatch);
  ok("second matched receives same room and seat 1", secondMatch?.roomCode === "ABCD12" && secondMatch.playerIndex === 1, secondMatch);
  ok("matched players are removed from queue", !queue.hasWaitingSocket(first.id) && !queue.hasWaitingSocket(second.id));
  ok("finding match count clears on match", counts.join(",") === "1,0", counts);
}

async function testCancelClearsQueue() {
  const first = new FakeSocket("s-cancel");
  const second = new FakeSocket("s-after-cancel");
  const counts: number[] = [];
  const queue = new FindMatchQueue<FakeSocket>({
    isEnabled: () => true,
    timeoutMs: () => 1_000,
    matchPlayers: async () => [matched("CANCEL", 0), matched("CANCEL", 1)],
    onWaitingCountChange: (count) => counts.push(count),
  });

  await queue.join({ socket: first, playerName: "Guest One", profileUsername: null });
  const cleared = queue.cancel(first);
  await queue.join({ socket: second, playerName: "Guest Two", profileUsername: null });
  ok("cancel clears queue", cleared && !queue.hasWaitingSocket(first.id) && queue.hasWaitingSocket(second.id));
  ok("cancel emits cancelled", (last(first, "find_match_cancelled") as { reason?: string })?.reason === "cancelled");
  ok("finding match count updates on cancel and next join", counts.join(",") === "1,0,1", counts);
  queue.cancel(second);
}

async function testDisconnectClearsQueue() {
  const first = new FakeSocket("s-disconnect");
  const second = new FakeSocket("s-after-disconnect");
  const queue = new FindMatchQueue<FakeSocket>({
    isEnabled: () => true,
    timeoutMs: () => 1_000,
    matchPlayers: async () => [matched("DISC", 0), matched("DISC", 1)],
  });

  await queue.join({ socket: first, playerName: "Guest One", profileUsername: null });
  const cleared = queue.disconnect(first);
  await queue.join({ socket: second, playerName: "Guest Two", profileUsername: null });
  ok("disconnect clears queue", cleared && !queue.hasWaitingSocket(first.id) && queue.hasWaitingSocket(second.id));
  queue.cancel(second);
}

async function testTimeoutClearsQueue() {
  const first = new FakeSocket("s-timeout");
  const second = new FakeSocket("s-after-timeout");
  const counts: number[] = [];
  const queue = new FindMatchQueue<FakeSocket>({
    isEnabled: () => true,
    timeoutMs: () => 20,
    matchPlayers: async () => [matched("TIME", 0), matched("TIME", 1)],
    onWaitingCountChange: (count) => counts.push(count),
  });

  await queue.join({ socket: first, playerName: "Guest One", profileUsername: null });
  await sleep(35);
  await queue.join({ socket: second, playerName: "Guest Two", profileUsername: null });
  ok("timeout clears queue", !queue.hasWaitingSocket(first.id) && queue.hasWaitingSocket(second.id));
  ok("timeout emits cancelled", (last(first, "find_match_cancelled") as { reason?: string })?.reason === "timeout");
  ok("finding match count updates on timeout and next join", counts.join(",") === "1,0,1", counts);
  queue.cancel(second);
}

async function main() {
  console.log("\n— Find Match MVP queue —");
  await testFlagOffRejects();
  await testFirstPlayerWaitsAndDuplicateIsIdempotent();
  await testSecondPlayerMatches();
  await testCancelClearsQueue();
  await testDisconnectClearsQueue();
  await testTimeoutClearsQueue();

  console.log("");
  console.log(`  Find Match queue: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("  Failures:");
    for (const failure of failures) console.log(`    - ${failure}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("  ✗ find-matchmaking test crashed:", err);
  process.exit(1);
});
