import test from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "../src/room-state.js";
import { createInMemoryRoomRepository } from "../src/room-repository.js";

test("saves, gets, and lists local prototype rooms", () => {
  const repo = createInMemoryRoomRepository();
  const room = createRoom({ roomCode: "spades1", seatToken: "seat-1" });

  repo.save(room);

  assert.equal(repo.has("SPADES1"), true);
  assert.equal(repo.get("spades1"), room);
  assert.deepEqual(repo.list(), [room]);
});

test("updates rooms through a deterministic local repository boundary", () => {
  const room = createRoom({ roomCode: "SPADES2", seatToken: "seat-1" });
  const repo = createInMemoryRoomRepository([room]);

  const updated = repo.update("spades2", (current) => ({
    ...current,
    phase: "custom_test_phase"
  }));

  assert.equal(updated.phase, "custom_test_phase");
  assert.equal(repo.get("SPADES2").phase, "custom_test_phase");
});

test("requires existing rooms for updates", () => {
  const repo = createInMemoryRoomRepository();

  assert.equal(repo.get("missing"), null);
  assert.throws(() => repo.require("missing"), /Room not found/);
  assert.throws(() => repo.update("missing", (room) => room), /Room not found/);
});

