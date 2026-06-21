import assert from "node:assert/strict";
import test from "node:test";
import {
  createTemporaryGuestName,
  resolveCasualGuestName,
  resolveRankedDisplayName,
} from "./guestIdentity.js";

test("casual guest flow creates a temporary identity from empty cache", () => {
  const name = resolveCasualGuestName("", "", 0.1234);

  assert.equal(name, "Guest 2110");
});

test("casual guest flow keeps an entered display name", () => {
  const name = resolveCasualGuestName("  Og Solo   Spader  ", "", 0.1234);

  assert.equal(name, "Og Solo Spader");
});

test("casual guest flow can reuse a saved display name", () => {
  const name = resolveCasualGuestName("", "  Saved Guest  ", 0.1234);

  assert.equal(name, "Saved Guest");
});

test("temporary guest names do not require account identity fields", () => {
  const name = createTemporaryGuestName(0.5);

  assert.match(name, /^Guest \d{4}$/);
});

test("ranked display can fall back to claimed account username", () => {
  const name = resolveRankedDisplayName("", "RankedUser");

  assert.equal(name, "RankedUser");
});

test("ranked display is unavailable without a claimed username", () => {
  const name = resolveRankedDisplayName("", "");

  assert.equal(name, null);
});
