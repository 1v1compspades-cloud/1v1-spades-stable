import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRoomRepository } from "../src/index.js";

test("saves, gets, and lists local rooms", () => {
  const repo = createInMemoryRoomRepository();
  const room = { roomCode: "test1", phase: "waiting" };

  repo.save(room);

  assert.equal(repo.has("TEST1"), true);
  assert.equal(repo.get("test1"), room);
  assert.deepEqual(repo.list(), [room]);
});

test("updates rooms through a deterministic local repository boundary", () => {
  const room = { roomCode: "TEST2", phase: "waiting" };
  const repo = createInMemoryRoomRepository([room]);

  const updated = repo.update("test2", (current) => ({
    ...current,
    phase: "custom_test_phase"
  }));

  assert.equal(updated.phase, "custom_test_phase");
  assert.equal(repo.get("TEST2").phase, "custom_test_phase");
});

test("requires existing rooms for updates", () => {
  const repo = createInMemoryRoomRepository();

  assert.equal(repo.get("missing"), null);
  assert.throws(() => repo.require("missing"), /Room not found/);
  assert.throws(() => repo.update("missing", (room) => room), /Room not found/);
});
