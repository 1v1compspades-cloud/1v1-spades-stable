import test from "node:test";
import assert from "node:assert/strict";
import {
  listVisualQaScripts,
  playFullHandWithVisualCards,
  runVisualQaScript,
  verifyVisualSeatViews
} from "../src/visual-qa-scripts.js";
import { createTwoSeatManualHarness } from "../src/manual-harness.js";
import { buildVisualShellModel } from "../src/visual-shell.js";

test("visual QA scripts list all deterministic manual scenarios", () => {
  assert.deepEqual(listVisualQaScripts(), [
    "normal-hand",
    "nil-made",
    "nil-failed",
    "bag-penalty",
    "match-win",
    "spectator-view",
    "reconnect-restore-active-room"
  ]);
});

test("visual QA scripts complete hands through visual card models", () => {
  for (const name of ["normal-hand", "nil-made", "nil-failed", "bag-penalty"]) {
    const result = runVisualQaScript(name);

    assert.equal(result.played.completedTricks, 13);
    assert.ok(["hand_complete", "match_complete"].includes(result.hostStatus.phase));
    assert.equal(result.verificationLog.length, 14);
    assert.equal(result.verificationLog.every((entry) => entry.valid), true);
    assert.equal(result.spectatorStatus.hand.length, 0);
    assert.equal(buildVisualShellModel(result.spectatorStatus).handCards.length, 0);
    assert.ok(result.hostStatus.handSummary);
  }
});

test("visual QA scripts cover nil made nil failed bag penalty and match win outcomes", () => {
  const nilMade = runVisualQaScript("nil-made");
  const nilFailed = runVisualQaScript("nil-failed");
  const bagPenalty = runVisualQaScript("bag-penalty");
  const matchWin = runVisualQaScript("match-win");

  assert.equal(nilMade.hostStatus.handSummary.players.player2.nilResult, "made");
  assert.equal(nilFailed.hostStatus.handSummary.players.player2.nilResult, "failed");
  assert.equal(bagPenalty.hostStatus.handSummary.players.player1.bagPenalty, -100);
  assert.equal(matchWin.hostStatus.phase, "match_complete");
  assert.equal(matchWin.hostStatus.winner, "player1");
});

test("visual QA script verifies spectator and reconnect restore scenarios", () => {
  const spectator = runVisualQaScript("spectator-view");
  const reconnect = runVisualQaScript("reconnect-restore-active-room");

  assert.equal(spectator.spectatorStatus.viewerSeat, "spectator");
  assert.deepEqual(spectator.spectatorStatus.hand, []);
  assert.equal(spectator.verificationLog.every((entry) => entry.valid), true);
  assert.equal(reconnect.restored.host.status.viewerSeat, "player1");
  assert.equal(reconnect.restored.guest.status.viewerSeat, "player2");
  assert.equal(reconnect.restored.host.status.phase, "hand_complete");
});

test("visual full-hand playthrough updates trick summaries and preserves hidden hands after each trick", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "VQAFH1" });
  harness.startPreset("close-game");
  const verificationLog = [verifyVisualSeatViews(harness, "initial")];
  const played = playFullHandWithVisualCards(harness, { verificationLog });

  assert.equal(played.completedTricks, 13);
  assert.equal(played.hostStatus.phase, "hand_complete");
  assert.equal(verificationLog.length, 14);
  for (const entry of verificationLog) {
    assert.equal(entry.valid, true);
    assert.equal(entry.spectatorHandCount, 0);
    assert.equal(entry.publicState.roomCode, "VQAFH1");
  }
  assert.match(verificationLog[1].publicState.lastTrick, /winner player[12]/);
  assert.equal(verificationLog.at(-1).hostHandCount, 0);
  assert.equal(verificationLog.at(-1).guestHandCount, 0);
});
