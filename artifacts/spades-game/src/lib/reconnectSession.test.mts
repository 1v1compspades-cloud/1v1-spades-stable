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

test("stale saved reconnect is cleared before casual matchmaking", () => {
  assert.equal(
    shouldClearSavedReconnectBeforeCasualMatch({
      hasSavedSession: true,
      availability: "unavailable",
    }),
    true,
  );
});

test("failed reconnect retry error clears stale saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Reconnect temporarily unavailable, please retry"), true);
});
