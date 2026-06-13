import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryStorage,
  listFixturePresetNames,
  requireFixturePreset,
  selectFixtureView
} from "../src/index.js";

test("memory storage supports local fixture sessions", () => {
  const storage = createMemoryStorage();
  storage.setItem("key", "value");

  assert.equal(storage.getItem("key"), "value");
  storage.removeItem("key");
  assert.equal(storage.getItem("key"), null);
});

test("fixture preset helpers list and require named presets", () => {
  const presets = {
    close: { name: "close" },
    win: { name: "win" }
  };

  assert.deepEqual(listFixturePresetNames(presets), ["close", "win"]);
  assert.equal(requireFixturePreset(presets, "close"), presets.close);
  assert.throws(() => requireFixturePreset(presets, "missing"), /Unknown manual fixture preset/);
});

test("selects fixture views with host fallback", () => {
  const host = { viewerSeat: "player1" };
  const guest = { viewerSeat: "player2" };

  assert.equal(selectFixtureView({ host, guest }, "guest"), guest);
  assert.equal(selectFixtureView({ host, guest }, "spectator"), host);
});
