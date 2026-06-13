import test from "node:test";
import assert from "node:assert/strict";
import { createLocalPlayerIdentityStore } from "../src/local-identity.js";

test("local player identity restores stable id token and display name", () => {
  const storage = createMemoryStorage();
  const store = createLocalPlayerIdentityStore({
    storage,
    namespace: "test",
    now: () => 1000,
    random: () => 0.123456789
  });

  const first = store.load();
  const renamed = store.saveDisplayName("  North Seat  ");
  const restored = createLocalPlayerIdentityStore({ storage, namespace: "test" }).load();

  assert.equal(first.playerId, restored.playerId);
  assert.equal(first.seatToken, restored.seatToken);
  assert.equal(renamed.displayName, "North Seat");
  assert.equal(restored.displayName, "North Seat");
});

test("local player identity saves and clears active room session", () => {
  const storage = createMemoryStorage();
  const store = createLocalPlayerIdentityStore({
    storage,
    namespace: "test-session",
    now: () => 2000,
    random: () => 0.987654321
  });
  const identity = store.load();

  const saved = store.saveSession({
    roomCode: "SPADES",
    seat: "player1",
    seatToken: "seat-room",
    playerId: identity.playerId
  });

  assert.deepEqual(saved.lastSession, {
    roomCode: "SPADES",
    seat: "player1",
    seatToken: "seat-room",
    playerId: identity.playerId
  });
  assert.deepEqual(store.sessionIdentity(), {
    playerId: identity.playerId,
    seatToken: "seat-room",
    displayName: "Player",
    lastSession: saved.lastSession
  });

  const cleared = store.clearSession();
  assert.equal(cleared.lastSession, null);
  assert.equal(store.sessionIdentity().seatToken, identity.seatToken);
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
