import test from "node:test";
import assert from "node:assert/strict";
import {
  createTwoSeatManualHarness,
  listManualFixturePresets
} from "../src/manual-harness.js";

test("manual harness creates two local seats with shared repository", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "LOCAL1" });
  const { created, joined } = harness.setup();

  assert.equal(created.status.viewerSeat, "player1");
  assert.equal(joined.status.viewerSeat, "player2");
  assert.equal(harness.repository.get("LOCAL1").players.player2.displayName, "Guest");
});

test("manual harness drives ready and bidding without networking", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "LOCAL2" });
  harness.setup();
  const ready = harness.readyBoth();

  assert.equal(ready.guest.status.phase, "bidding");
  assert.match(harness.statusText(), /Bid next: player1/);

  const bids = harness.bidBoth({ hostBid: 5, guestBid: 2 });

  assert.equal(bids.guest.status.phase, "playing");
  assert.match(harness.statusText(harness.guest), /Phase: playing/);
});

test("manual harness can play a scripted trick without card graphics", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "LOCAL3" });
  harness.setup();
  harness.readyBoth();
  harness.bidBoth({ hostBid: 4, guestBid: 3 });

  const trick = harness.playOneTrick();

  assert.equal(trick.followed.status.lastTrick.plays.length, 2);
  assert.match(harness.statusText(), /Playable cards:/);
});

test("manual harness can play a full hand without networking", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "LOCAL4" });
  harness.setup();
  harness.readyBoth();
  harness.bidBoth({ hostBid: 4, guestBid: 3 });

  const completed = harness.playFullHand();

  assert.ok(completed.followed.status.phase === "hand_complete" || completed.followed.status.phase === "match_complete");
  assert.match(harness.statusText(), /Hand summary:/);
});

test("manual harness exposes Phase 11 fixture presets", () => {
  assert.deepEqual(listManualFixturePresets(), [
    "nil-made",
    "nil-failed",
    "bag-penalty",
    "close-game",
    "match-win",
    "reconnect-after-hand",
    "reconnect-after-match-complete"
  ]);
});

test("manual fixture preset can produce nil made and nil failed summaries", () => {
  const nilMade = createTwoSeatManualHarness({ roomCode: "PRE001" }).runPreset("nil-made");
  const nilFailed = createTwoSeatManualHarness({ roomCode: "PRE002" }).runPreset("nil-failed");

  assert.equal(nilMade.hostStatus.handSummary.players.player2.nilResult, "made");
  assert.equal(nilFailed.hostStatus.handSummary.players.player2.nilResult, "failed");
});

test("manual fixture preset can complete a local match and reconnect safely", () => {
  const matchWin = createTwoSeatManualHarness({ roomCode: "PRE003" }).runPreset("match-win");
  const reconnectAfterHand = createTwoSeatManualHarness({ roomCode: "PRE004" }).runPreset("reconnect-after-hand");
  const reconnectAfterMatch = createTwoSeatManualHarness({ roomCode: "PRE005" }).runPreset("reconnect-after-match-complete");

  assert.equal(matchWin.hostStatus.phase, "match_complete");
  assert.equal(matchWin.hostStatus.winner, "player1");
  assert.equal(reconnectAfterHand.restored.host.status.phase, "hand_complete");
  assert.equal(reconnectAfterHand.restored.guest.status.viewerSeat, "player2");
  assert.equal(reconnectAfterMatch.restored.host.status.phase, "match_complete");
  assert.equal(reconnectAfterMatch.restored.guest.status.alreadySeated, true);
});
