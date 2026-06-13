import test from "node:test";
import assert from "node:assert/strict";
import { createTwoSeatManualHarness } from "../src/manual-harness.js";

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
