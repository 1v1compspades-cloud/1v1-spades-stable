import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldClearSavedReconnectAfterFailure,
  shouldClearSavedReconnectBeforeCasualMatch,
  shouldShowReconnectPanel,
} from "./reconnectSession.js";

test("Play Now does not show reconnect panel during matchmaking", () => {
  assert.equal(
    shouldShowReconnectPanel({
      hasSavedSession: true,
      availability: "available",
      isFindingMatch: true,
      isFindingRankedMatch: false,
    }),
    false,
  );
});

test("Ranked Match does not show reconnect panel during matchmaking", () => {
  assert.equal(
    shouldShowReconnectPanel({
      hasSavedSession: true,
      availability: "available",
      isFindingMatch: false,
      isFindingRankedMatch: true,
    }),
    false,
  );
});

test("stale saved reconnect is cleared before casual matchmaking", () => {
  assert.equal(
    shouldClearSavedReconnectBeforeCasualMatch({
      hasSavedSession: true,
      availability: "unavailable",
    }),
    true,
  );
});

test("available saved reconnect is preserved before casual matchmaking", () => {
  assert.equal(
    shouldClearSavedReconnectBeforeCasualMatch({
      hasSavedSession: true,
      availability: "available",
    }),
    false,
  );
});

test("retryable reconnect error preserves saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Reconnect temporarily unavailable, please retry"), false);
});

test("transient non-reconnect failure does not clear saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Network offline"), false);
});

test("terminal reconnect failures clear saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Room not found"), true);
  assert.equal(shouldClearSavedReconnectAfterFailure("Reconnect token invalid"), true);
  assert.equal(shouldClearSavedReconnectAfterFailure("That seat is held by another player"), true);
});
