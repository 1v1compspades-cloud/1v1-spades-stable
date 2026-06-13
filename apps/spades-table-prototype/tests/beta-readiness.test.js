import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBetaSafetyChecklist,
  friendlyTesterError,
  hiddenHandSafe,
  listManualBetaFlows
} from "../src/beta-readiness.js";
import { createSpadesAppController } from "../src/app-controller.js";
import { createQuickMatchQueue } from "../src/quick-match.js";
import { createSpadesServerBoundary } from "../src/server-boundary.js";
import { createInMemoryRoomRepository } from "../../../packages/game-shell-core/src/index.js";

test("beta safety checklist reports hidden-hand safety and beta context", () => {
  const spectatorStatus = statusView({
    viewerSeat: "spectator",
    hand: [],
    hiddenHandCounts: { player1: 13, player2: 13 }
  });
  const unsafeSpectator = statusView({
    viewerSeat: "spectator",
    hand: [{ rank: "A", suit: "spades" }],
    hiddenHandCounts: { player1: 13, player2: 13 }
  });

  const checklist = buildBetaSafetyChecklist({
    status: spectatorStatus,
    transportMode: "real-server",
    serverStatus: "real server connected",
    webSocketStatus: "connected",
    playerId: "tester-1",
    lastAction: "join room",
    lastError: ""
  });

  assert.equal(hiddenHandSafe(spectatorStatus), true);
  assert.equal(hiddenHandSafe(unsafeSpectator), false);
  assert.equal(checklist.find((item) => item.name === "hidden-hand safe").pass, true);
  assert.equal(checklist.find((item) => item.name === "current player id").detail, "tester-1");
  assert.equal(checklist.find((item) => item.name === "last error").detail, "none");
});

test("tester-friendly errors cover beta failure modes", () => {
  const cases = [
    ["fetch failed", "Connection lost"],
    ["No active room session", "Reconnecting did not find"],
    ["Room not found for snapshot", "Room not found"],
    ["room full", "Room is full"],
    ["This player is already seated in this room", "already seated"],
    ["It is not this player's bid turn", "Wrong turn"],
    ["Stale action expected bidding phase", "no longer valid"],
    ["Bid must be 0 through 13", "Invalid bid"],
    ["Illegal Spades play", "Invalid card"],
    ["Join this room before taking a player action", "Spectator blocked"]
  ];

  for (const [message, expected] of cases) {
    assert.match(friendlyTesterError(message), new RegExp(expected));
  }
});

test("manual beta flows include the external tester smoke paths", () => {
  assert.deepEqual(listManualBetaFlows().map((flow) => flow.id), [
    "create-room-with-friend",
    "join-room-with-code",
    "quick-match",
    "reconnect",
    "leave-room",
    "full-hand",
    "full-match",
    "new-match"
  ]);
});

test("beta readiness flow restores seat after refresh-style reconnect", () => {
  const repository = createInMemoryRoomRepository();
  const storage = createMemoryStorage();
  const firstController = createSpadesAppController({
    repository,
    storage,
    createPlayerId: () => "tester-host"
  });
  firstController.createRoom({ roomCode: "BETA01", seatToken: "seat-host" });

  const refreshedController = createSpadesAppController({
    repository,
    storage,
    createPlayerId: () => "tester-host"
  });
  const restored = refreshedController.restoreActiveRoom();

  assert.equal(restored.status.viewerSeat, "player1");
  assert.equal(restored.status.alreadySeated, true);
  assert.equal(hiddenHandSafe(restored.status), true);
});

test("beta readiness room code join and leave rejoin stay safe", () => {
  const repository = createInMemoryRoomRepository();
  const host = createSpadesAppController({
    repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "tester-host"
  });
  const guest = createSpadesAppController({
    repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "tester-guest"
  });

  host.createRoom({ roomCode: "BETA02", seatToken: "seat-host" });
  const joined = guest.joinRoom({ roomCode: "BETA02", seatToken: "seat-guest" });
  const left = guest.leaveRoom();
  const rejoined = guest.joinRoom({ roomCode: "BETA02", seatToken: "seat-guest" });

  assert.equal(joined.status.viewerSeat, "player2");
  assert.equal(left.status.viewerSeat, "spectator");
  assert.equal(rejoined.status.viewerSeat, "player2");
  assert.equal(hiddenHandSafe(rejoined.status), true);
});

test("beta readiness quick match pairs players and spectator actions are blocked", () => {
  const boundary = createSpadesServerBoundary();
  const queue = createQuickMatchQueue({ boundary, createRoomCode: () => "BETAQM" });

  const first = queue.joinQueue(queueRequest("tester-host", "seat-host", "Host", "q1"));
  const second = queue.joinQueue(queueRequest("tester-guest", "seat-guest", "Guest", "q2"));
  const spectator = boundary.handle({
    type: "ready",
    roomCode: second.match.roomCode,
    actionId: "spectator-ready",
    identity: { playerId: "tester-viewer", seatToken: "seat-viewer" }
  });

  assert.equal(first.queue.state, "waiting");
  assert.equal(second.queue.state, "matched");
  assert.equal(second.view.viewerSeat, "player2");
  assert.equal(second.spectatorView.viewerSeat, "spectator");
  assert.equal(hiddenHandSafe(second.spectatorView), true);
  assert.equal(spectator.ok, false);
  assert.match(friendlyTesterError(spectator.error.message), /Spectator blocked/);
});

function statusView(overrides = {}) {
  return {
    roomCode: "BETA",
    viewerSeat: "player1",
    hand: [],
    hiddenHandCounts: { player1: 0, player2: 0 },
    ...overrides
  };
}

function queueRequest(playerId, seatToken, displayName, actionId) {
  return {
    type: "joinQueue",
    displayName,
    actionId,
    identity: { playerId, seatToken }
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
