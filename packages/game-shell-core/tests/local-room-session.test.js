import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocalRoomSessionStorage,
  createMemoryStorage
} from "../src/index.js";

const sessions = createLocalRoomSessionStorage({ namespace: "fixture" });

test("saves and restores a namespaced active room session", () => {
  const storage = createMemoryStorage();
  const session = sessions.saveActiveRoomSession({
    roomCode: "room",
    seatToken: "seat-1",
    playerId: "device-1",
    seat: "player1",
    updatedAt: "2026-06-13T10:00:00.000Z"
  }, storage);

  assert.deepEqual(session, {
    roomCode: "ROOM",
    seatToken: "seat-1",
    playerId: "device-1",
    seat: "player1",
    updatedAt: "2026-06-13T10:00:00.000Z"
  });
  assert.deepEqual(sessions.loadSavedActiveRoom(storage), session);
  assert.equal(storage.getItem(sessions.roomSeatTokenKey("ROOM")), "seat-1");
});

test("falls back to the newest saved room when active room is missing", () => {
  const storage = createMemoryStorage();
  sessions.saveActiveRoomSession({
    roomCode: "OLD111",
    seatToken: "old-seat",
    updatedAt: "2026-06-13T09:00:00.000Z"
  }, storage);
  sessions.saveActiveRoomSession({
    roomCode: "NEW222",
    seatToken: "new-seat",
    updatedAt: "2026-06-13T10:00:00.000Z"
  }, storage);
  storage.removeItem(sessions.activeRoomSessionKey);

  assert.equal(sessions.loadSavedActiveRoom(storage).roomCode, "NEW222");
});

test("clears active room and room-specific seat token", () => {
  const storage = createMemoryStorage();
  sessions.saveActiveRoomSession({
    roomCode: "CLEAR1",
    seatToken: "seat-clear",
    playerId: "device-clear"
  }, storage);

  const cleared = sessions.clearSavedActiveRoom(storage, "clear1");

  assert.equal(cleared.roomCode, "CLEAR1");
  assert.equal(sessions.loadSavedActiveRoom(storage), null);
  assert.equal(sessions.loadSavedRoomSession("CLEAR1", storage), null);
  assert.equal(storage.getItem(sessions.roomSeatTokenKey("CLEAR1")), null);
});
