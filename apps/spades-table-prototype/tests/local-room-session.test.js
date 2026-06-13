import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalRoomSessionStorage,
  createMemoryStorage
} from "../../../packages/game-shell-core/src/index.js";

const {
  activeRoomSessionKey,
  clearSavedActiveRoom,
  loadSavedActiveRoom,
  loadSavedRoomSession,
  roomSeatTokenKey,
  saveActiveRoomSession
} = createLocalRoomSessionStorage({ namespace: "spades" });

test("saves and restores the active room session", () => {
  const storage = createMemoryStorage();
  const session = saveActiveRoomSession({
    roomCode: "spades",
    seatToken: "seat-1",
    playerId: "device-1",
    seat: "player1",
    updatedAt: "2026-06-13T10:00:00.000Z"
  }, storage);

  assert.deepEqual(session, {
    roomCode: "SPADES",
    seatToken: "seat-1",
    playerId: "device-1",
    seat: "player1",
    updatedAt: "2026-06-13T10:00:00.000Z"
  });
  assert.deepEqual(loadSavedActiveRoom(storage), session);
  assert.equal(storage.getItem(roomSeatTokenKey("SPADES")), "seat-1");
});

test("falls back to the newest saved room when active room is missing", () => {
  const storage = createMemoryStorage();
  saveActiveRoomSession({
    roomCode: "OLD111",
    seatToken: "old-seat",
    updatedAt: "2026-06-13T09:00:00.000Z"
  }, storage);
  saveActiveRoomSession({
    roomCode: "NEW222",
    seatToken: "new-seat",
    updatedAt: "2026-06-13T10:00:00.000Z"
  }, storage);
  storage.removeItem(activeRoomSessionKey);

  assert.equal(loadSavedActiveRoom(storage).roomCode, "NEW222");
});

test("loads a specific room session from map or legacy seat-token key", () => {
  const storage = createMemoryStorage();
  saveActiveRoomSession({
    roomCode: "ROOM12",
    seatToken: "mapped-seat"
  }, storage);

  assert.equal(loadSavedRoomSession("room12", storage).seatToken, "mapped-seat");

  clearSavedActiveRoom(storage, "ROOM12");
  storage.setItem(roomSeatTokenKey("ROOM12"), "legacy-seat");

  assert.deepEqual(loadSavedRoomSession("room12", storage), {
    roomCode: "ROOM12",
    seatToken: "legacy-seat",
    playerId: null,
    seat: null,
    updatedAt: null
  });
});

test("clears active room and room-specific seat token", () => {
  const storage = createMemoryStorage();
  saveActiveRoomSession({
    roomCode: "CLEAR1",
    seatToken: "seat-clear",
    playerId: "device-clear"
  }, storage);

  const cleared = clearSavedActiveRoom(storage, "clear1");

  assert.equal(cleared.roomCode, "CLEAR1");
  assert.equal(loadSavedActiveRoom(storage), null);
  assert.equal(loadSavedRoomSession("CLEAR1", storage), null);
  assert.equal(storage.getItem(roomSeatTokenKey("CLEAR1")), null);
});
