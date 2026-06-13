import test from "node:test";
import assert from "node:assert/strict";
import { PHASE_0_ARCHITECTURE_MAP } from "../src/architecture-map.js";

test("documents the architecture concepts to port from Euchre", () => {
  assert.deepEqual(Object.keys(PHASE_0_ARCHITECTURE_MAP), [
    "identity",
    "reconnect",
    "accounts",
    "leaderboard",
    "quickMatch",
    "tournamentHistory"
  ]);
});

