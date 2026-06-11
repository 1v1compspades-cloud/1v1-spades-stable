import test from "node:test";
import assert from "node:assert/strict";
import {
  activeRoomSessionKey,
  clearSavedActiveRoom,
  loadSavedActiveRoom,
  roomSeatTokenKey,
  roomSessionsKey
} from "../src/local-room-session.js";

test("clearing active room removes the saved seat token that forces lobby restore", () => {
  const storage = fakeStorage();
  storage.setItem(activeRoomSessionKey, JSON.stringify({
    roomCode: "STUCK1",
    seatToken: "host-token",
    updatedAt: "2026-06-10T12:00:00.000Z"
  }));
  storage.setItem(roomSeatTokenKey("STUCK1"), "host-token");
  storage.setItem(roomSessionsKey, JSON.stringify({
    STUCK1: {
      roomCode: "STUCK1",
      seatToken: "host-token",
      updatedAt: "2026-06-10T12:00:00.000Z"
    }
  }));

  const cleared = clearSavedActiveRoom(storage);

  assert.equal(cleared.roomCode, "STUCK1");
  assert.equal(storage.getItem(activeRoomSessionKey), null);
  assert.equal(storage.getItem(roomSeatTokenKey("STUCK1")), null);
  assert.deepEqual(JSON.parse(storage.getItem(roomSessionsKey)), {});
  assert.equal(loadSavedActiveRoom(storage), null);
});

test("clearing one saved room leaves other saved room sessions intact", () => {
  const storage = fakeStorage();
  storage.setItem(activeRoomSessionKey, JSON.stringify({
    roomCode: "ROOMA",
    seatToken: "token-a",
    updatedAt: "2026-06-10T12:00:00.000Z"
  }));
  storage.setItem(roomSeatTokenKey("ROOMA"), "token-a");
  storage.setItem(roomSeatTokenKey("ROOMB"), "token-b");
  storage.setItem(roomSessionsKey, JSON.stringify({
    ROOMA: {
      roomCode: "ROOMA",
      seatToken: "token-a",
      updatedAt: "2026-06-10T12:00:00.000Z"
    },
    ROOMB: {
      roomCode: "ROOMB",
      seatToken: "token-b",
      updatedAt: "2026-06-10T12:05:00.000Z"
    }
  }));

  clearSavedActiveRoom(storage, "ROOMA");

  assert.equal(storage.getItem(roomSeatTokenKey("ROOMA")), null);
  assert.equal(storage.getItem(roomSeatTokenKey("ROOMB")), "token-b");
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(roomSessionsKey))), ["ROOMB"]);
  assert.equal(loadSavedActiveRoom(storage).roomCode, "ROOMB");
});

function fakeStorage() {
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
