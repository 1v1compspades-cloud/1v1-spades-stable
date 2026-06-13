import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDiagnosticsBundle,
  createBetaIssueReport,
  createLocalBetaFeedbackStore,
  formatDiagnosticsSummary,
  formatIssueReport
} from "../src/beta-feedback.js";

test("diagnostics bundle captures send-to-dev fields without card ids", () => {
  const status = {
    roomCode: "BETA12",
    phase: "playing",
    viewerSeat: "player1",
    alreadySeated: true,
    currentTurn: "player2",
    hand: [{ rank: "ace", suit: "spades" }],
    currentTrick: [{ player: "player1", card: { rank: "2", suit: "clubs" } }],
    lastTrick: { winner: "player1" },
    score: { player1: 10, player2: 0 },
    bids: { player1: 4, player2: 3 },
    bags: { player1: 1, player2: 0 }
  };

  const bundle = buildDiagnosticsBundle({
    status,
    transportMode: "real-server",
    serverStatus: "real server connected",
    webSocketStatus: "connected",
    playerId: "player-local-1",
    displayName: "Tester One",
    lastAction: "play card",
    lastError: "Wrong turn",
    hiddenHandSafe: true,
    fixturePreset: "close-game",
    actionLogEntries: [{
      outcome: "failure",
      action: "play card",
      message: "Wrong turn",
      summary: {
        phase: "playing",
        viewerSeat: "player1",
        currentTurn: "player2"
      }
    }],
    timestamp: "2026-06-13T12:00:00.000Z"
  });
  const summary = formatDiagnosticsSummary(bundle);

  assert.equal(bundle.roomCode, "BETA12");
  assert.equal(bundle.phase, "playing");
  assert.equal(bundle.transport, "real-server");
  assert.equal(bundle.seat, "player1");
  assert.equal(bundle.lastAction, "play card");
  assert.equal(bundle.lastError, "Wrong turn");
  assert.equal(bundle.hiddenHandSafe, true);
  assert.equal(bundle.visibleHandCount, 1);
  assert.match(summary, /Send this to dev:/);
  assert.match(summary, /Room code: BETA12/);
  assert.match(summary, /Hidden-hand safe: yes/);
  assert.doesNotMatch(summary, /ace|spades|2-clubs|clubs/i);
});

test("local beta feedback store saves exports and clears reports", () => {
  const store = createLocalBetaFeedbackStore({
    storage: createMemoryStorage(),
    namespace: "feedback-test"
  });
  const diagnostics = buildDiagnosticsBundle({
    status: { roomCode: "BUG123", phase: "bidding", viewerSeat: "player2" },
    hiddenHandSafe: true,
    timestamp: "2026-06-13T12:00:00.000Z"
  });
  const report = createBetaIssueReport({
    title: "Bid button did nothing",
    steps: "Joined room, tapped bid",
    expected: "Bid accepted",
    actual: "No visible change",
    diagnostics,
    timestamp: "2026-06-13T12:01:00.000Z"
  });

  store.record(report);

  assert.equal(store.list().length, 1);
  assert.match(formatIssueReport(store.list()[0]), /Bid button did nothing/);
  assert.match(store.exportText(), /Room code: BUG123/);
  assert.equal(store.clear().length, 0);
  assert.equal(store.exportText(), "No local beta reports saved.");
});

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    }
  };
}
