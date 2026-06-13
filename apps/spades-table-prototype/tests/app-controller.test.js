import test from "node:test";
import assert from "node:assert/strict";
import { createSpadesAppController } from "../src/app-controller.js";
import { loadSavedActiveRoom } from "../src/local-room-session.js";

test("create room stores active session and returns sanitized status", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });

  const result = controller.createRoom({
    roomCode: "ROOM01",
    seatToken: "seat-1",
    displayName: "North"
  });

  assert.equal(result.session.roomCode, "ROOM01");
  assert.equal(result.session.seatToken, "seat-1");
  assert.equal(result.status.viewerSeat, "player1");
  assert.equal(result.status.players.player1.displayName, "North");
  assert.deepEqual(loadSavedActiveRoom(storage), result.session);
});

test("join room stores active session for player2", () => {
  const hostStorage = createMemoryStorage();
  const guestStorage = createMemoryStorage();
  const host = createSpadesAppController({
    storage: hostStorage,
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: guestStorage,
    createPlayerId: () => "device-guest"
  });

  host.createRoom({ roomCode: "ROOM02", seatToken: "seat-host" });
  const joined = guest.joinRoom({
    roomCode: "room02",
    seatToken: "seat-guest",
    displayName: "South"
  });

  assert.equal(joined.seat, "player2");
  assert.equal(joined.session.seat, "player2");
  assert.equal(joined.status.viewerSeat, "player2");
  assert.equal(loadSavedActiveRoom(guestStorage).seatToken, "seat-guest");
});

test("restore active room reconnects the saved seat", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  controller.createRoom({ roomCode: "ROOM03", seatToken: "seat-1" });

  const restored = controller.restoreActiveRoom();

  assert.equal(restored.session.roomCode, "ROOM03");
  assert.equal(restored.status.viewerSeat, "player1");
  assert.equal(restored.status.alreadySeated, true);
});

test("clear active room removes saved session", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  controller.createRoom({ roomCode: "ROOM04", seatToken: "seat-1" });

  const cleared = controller.clearActiveRoom();

  assert.equal(cleared.cleared.roomCode, "ROOM04");
  assert.equal(controller.getActiveRoomStatus(), null);
  assert.equal(loadSavedActiveRoom(storage), null);
});

test("ready player updates room status without leaking hidden hands", () => {
  const hostStorage = createMemoryStorage();
  const guestStorage = createMemoryStorage();
  const host = createSpadesAppController({
    storage: hostStorage,
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: guestStorage,
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "ROOM05", seatToken: "seat-host", coinFlipWinner: "player1" });
  guest.joinRoom({ roomCode: "ROOM05", seatToken: "seat-guest" });

  const hostReady = host.readyPlayer();
  const guestReady = guest.readyPlayer();
  const spectatorStatus = host.getRoomStatus("ROOM05");

  assert.equal(hostReady.status.playerReady.player1, true);
  assert.equal(guestReady.status.phase, "bidding");
  assert.equal(guestReady.status.hand.length, 13);
  assert.deepEqual(spectatorStatus.hand, []);
  assert.deepEqual(spectatorStatus.hiddenHandCounts, { player1: 13, player2: 13 });
});

test("leave room clears active session and marks the seat disconnected", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  controller.createRoom({ roomCode: "ROOM06", seatToken: "seat-1" });

  const result = controller.leaveRoom();

  assert.equal(result.room.players.player1.connected, false);
  assert.equal(loadSavedActiveRoom(storage), null);
});

test("bidding status shows next bidder and moves to play after both bids", () => {
  const hostStorage = createMemoryStorage();
  const guestStorage = createMemoryStorage();
  const host = createSpadesAppController({
    storage: hostStorage,
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: guestStorage,
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "BID001", seatToken: "seat-host", coinFlipWinner: "player1" });
  guest.joinRoom({ roomCode: "BID001", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  assert.equal(host.getBiddingStatus().nextBidder, "player1");

  const hostBid = host.submitBid({ bid: 4, actionSequence: 1 });
  assert.equal(hostBid.status.phase, "bidding");
  assert.equal(hostBid.status.biddingStatus.nextBidder, "player2");
  assert.deepEqual(hostBid.status.bids, { player1: "locked", player2: null });

  const guestBid = guest.submitBid({ bid: 3, actionSequence: 1 });
  assert.equal(guestBid.status.phase, "playing");
  assert.equal(guestBid.status.biddingStatus.complete, true);
  assert.equal(guestBid.status.biddingStatus.nextBidder, null);
});

test("duplicate and stale bid actions are protected by controller action ids", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  const guest = createSpadesAppController({
    repository: controller.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-2"
  });
  controller.createRoom({ roomCode: "BID002", seatToken: "seat-1" });
  guest.joinRoom({ roomCode: "BID002", seatToken: "seat-2" });
  controller.readyPlayer();
  guest.readyPlayer();

  const firstBid = controller.submitBid({ bid: 5, actionSequence: 7 });
  const replayedBid = controller.submitBid({ bid: 5, actionSequence: 7 });

  assert.equal(replayedBid.room, firstBid.room);
  assert.deepEqual(replayedBid.status.bids, { player1: "locked", player2: null });
  assert.throws(() => controller.submitBid({ bid: 6, actionSequence: 8 }), /bid turn/);
});

test("wrong player cannot bid before their turn", () => {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "BID003", seatToken: "seat-host" });
  guest.joinRoom({ roomCode: "BID003", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  assert.throws(() => guest.submitBid({ bid: 3 }), /bid turn/);
  assert.equal(host.getBiddingStatus().nextBidder, "player1");
});

test("invalid bids and stale phase submissions return clear errors without corrupting state", () => {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "BID004", seatToken: "seat-host" });
  guest.joinRoom({ roomCode: "BID004", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  assert.throws(() => host.submitBid({ bid: 14 }), /0 through 13/);
  assert.deepEqual(host.getActiveRoomStatus().bids, { player1: null, player2: null });

  host.submitBid({ bid: 0 });
  const guestBid = guest.submitBid({ bid: 2 });

  assert.equal(guestBid.status.phase, "playing");
  assert.throws(() => host.submitBid({ bid: 1 }), /Stale action expected bidding phase/);
  assert.equal(host.getActiveRoomStatus().phase, "playing");
});

test("third visitor becomes spectator and receives public room-full status only", () => {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });
  const visitor = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-visitor"
  });
  host.createRoom({ roomCode: "FULL01", seatToken: "seat-host" });
  guest.joinRoom({ roomCode: "FULL01", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  const spectator = visitor.joinRoom({ roomCode: "FULL01", seatToken: "seat-visitor" });

  assert.equal(spectator.seat, "spectator");
  assert.equal(spectator.session, null);
  assert.equal(spectator.status.viewerSeat, "spectator");
  assert.equal(spectator.status.alreadySeated, false);
  assert.deepEqual(spectator.status.hand, []);
  assert.deepEqual(spectator.status.hiddenHandCounts, { player1: 13, player2: 13 });
});

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
