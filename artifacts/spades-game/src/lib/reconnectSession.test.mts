import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldClearSavedReconnectAfterAvailabilityCheck,
  shouldClearSavedReconnectAfterFailure,
  shouldClearSavedReconnectBeforeCasualMatch,
  shouldRetryReconnectAvailabilityCheck,
  shouldRetryReconnectAfterFailure,
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

test("unverified saved reconnect still shows reconnect controls", () => {
  assert.equal(
    shouldShowReconnectPanel({
      hasSavedSession: true,
      availability: "unverified",
      isFindingMatch: false,
      isFindingRankedMatch: false,
    }),
    true,
  );
});

test("unverified saved reconnect retries availability checks", () => {
  assert.equal(
    shouldRetryReconnectAvailabilityCheck({
      hasSavedSession: true,
      availability: "unverified",
      isFindingMatch: false,
      isFindingRankedMatch: false,
      connected: true,
    }),
    true,
  );
});

test("availability retry pauses while disconnected or matchmaking", () => {
  assert.equal(
    shouldRetryReconnectAvailabilityCheck({
      hasSavedSession: true,
      availability: "unverified",
      isFindingMatch: false,
      isFindingRankedMatch: false,
      connected: false,
    }),
    false,
  );
  assert.equal(
    shouldRetryReconnectAvailabilityCheck({
      hasSavedSession: true,
      availability: "unverified",
      isFindingMatch: true,
      isFindingRankedMatch: false,
      connected: true,
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

test("unverified saved reconnect is preserved before casual matchmaking", () => {
  assert.equal(
    shouldClearSavedReconnectBeforeCasualMatch({
      hasSavedSession: true,
      availability: "unverified",
    }),
    false,
  );
});

test("terminal availability reasons clear saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterAvailabilityCheck({ available: false, reason: "room_not_found" }), true);
  assert.equal(shouldClearSavedReconnectAfterAvailabilityCheck({ available: false, reason: "game_over" }), true);
  assert.equal(shouldClearSavedReconnectAfterAvailabilityCheck({ available: false, reason: "token_mismatch" }), true);
});

test("retryable availability reasons preserve saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterAvailabilityCheck({ available: false, reason: "check_failed" }), false);
  assert.equal(shouldClearSavedReconnectAfterAvailabilityCheck({ available: false, reason: "db_error" }), false);
  assert.equal(shouldClearSavedReconnectAfterAvailabilityCheck({ available: false, reason: "seat_active" }), false);
});

test("retryable reconnect error preserves saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Reconnect temporarily unavailable, please retry"), false);
});

test("transient non-reconnect failure does not clear saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Network offline"), false);
});

test("retryable room reconnect failures stay on reconnect flow", () => {
  assert.equal(shouldRetryReconnectAfterFailure("Reconnect temporarily unavailable, please retry"), true);
  assert.equal(shouldRetryReconnectAfterFailure("No socket"), true);
  assert.equal(shouldRetryReconnectAfterFailure("Seat already active in another tab"), true);
});

test("terminal room reconnect failures do not retry", () => {
  assert.equal(shouldRetryReconnectAfterFailure("Reconnect token invalid"), false);
  assert.equal(shouldRetryReconnectAfterFailure("That seat is held by another player"), false);
});

test("terminal reconnect failures clear saved reconnect", () => {
  assert.equal(shouldClearSavedReconnectAfterFailure("Room not found"), true);
  assert.equal(shouldClearSavedReconnectAfterFailure("Reconnect token invalid"), true);
  assert.equal(shouldClearSavedReconnectAfterFailure("That seat is held by another player"), true);
});
