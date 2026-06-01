/**
 * Tournament-lobby start-control gating.
 *
 * Covers the four required behaviors:
 *   - host sees disabled "Need X more" before the lobby is full
 *   - host sees enabled "Start Tournament" once full
 *   - a non-host never sees the start button
 *   - a host whose host token is missing/invalid on this device sees a
 *     warning instead of the control being silently hidden
 *
 * Run with:
 *   ./artifacts/spades-game/node_modules/.bin/tsx --test \
 *     artifacts/spades-game/src/lib/hostControls.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStartControl, HOST_TOKEN_WARNING } from "./hostControls.js";

const base = {
  iAmInRoster: true,
  iAmHost: true,
  hasHostToken: true,
  playerCount: 5,
  size: 8,
  starting: false,
};

test("host sees disabled 'Need X more' before the lobby is full", () => {
  const c = computeStartControl({ ...base, playerCount: 5, size: 8 });
  assert.equal(c.kind, "start");
  assert.equal(c.kind === "start" && c.enabled, false);
  assert.equal(c.kind === "start" && c.label, "Need 3 more");
});

test("host sees enabled 'Start Tournament' once full", () => {
  const c = computeStartControl({ ...base, playerCount: 8, size: 8 });
  assert.equal(c.kind, "start");
  assert.equal(c.kind === "start" && c.enabled, true);
  assert.equal(c.kind === "start" && c.label, "Start Tournament");
});

test("non-host never sees the start button", () => {
  const c = computeStartControl({ ...base, iAmHost: false, playerCount: 8, size: 8 });
  assert.equal(c.kind, "leave");
});

test("missing/invalid host token shows a warning instead of hiding controls", () => {
  const c = computeStartControl({ ...base, hasHostToken: false, playerCount: 8, size: 8 });
  assert.equal(c.kind, "warning");
  assert.equal(c.kind === "warning" && c.message, HOST_TOKEN_WARNING);
});

test("non-roster viewer gets no control at all", () => {
  const c = computeStartControl({ ...base, iAmInRoster: false });
  assert.equal(c.kind, "hidden");
});

test("starting state shows a disabled 'Starting…' button", () => {
  const c = computeStartControl({ ...base, playerCount: 8, size: 8, starting: true });
  assert.equal(c.kind, "start");
  assert.equal(c.kind === "start" && c.enabled, false);
  assert.equal(c.kind === "start" && c.label, "Starting…");
});

test("token warning takes priority over a full lobby", () => {
  const c = computeStartControl({ ...base, hasHostToken: false, playerCount: 8, size: 8, starting: false });
  assert.equal(c.kind, "warning");
});
