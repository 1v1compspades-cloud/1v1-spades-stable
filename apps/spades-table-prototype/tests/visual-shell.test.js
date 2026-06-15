import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeMessages,
  buildVisualQaReport,
  buildVisualShellModel
} from "../src/visual-shell.js";
import { createTwoSeatManualHarness } from "../src/manual-harness.js";

test("visual shell model builds card buttons from sanitized hand only", () => {
  const model = buildVisualShellModel({
    phase: "playing",
    viewerSeat: "player1",
    playerReady: { player1: true, player2: true },
    currentTurn: "player1",
    currentPlayerStatus: { canAct: true },
    biddingStatus: { nextBidder: null },
    score: { player1: 10, player2: 0 },
    tricksTaken: { player1: 1, player2: 0 },
    bids: { player1: 4, player2: 3 },
    bags: { player1: 1, player2: 0 },
    playableCardStatus: { cardIds: ["A-spades"] },
    hand: [
      { rank: "A", suit: "spades" },
      { rank: "2", suit: "clubs" }
    ],
    currentTrick: [
      { player: "player1", card: { rank: "A", suit: "spades" } }
    ],
    lastTrick: {
      winner: "player2",
      plays: [
        { player: "player1", card: { rank: "2", suit: "clubs" } },
        { player: "player2", card: { rank: "A", suit: "clubs" } }
      ]
    }
  });

  assert.equal(model.phase, "playing");
  assert.equal(model.action, "Play one highlighted card");
  assert.deepEqual(model.handCards, [
    {
      id: "A-spades",
      label: "A-spades",
      rank: "A",
      suit: "spades",
      playable: true,
      ariaLabel: "Play A of spades",
      stateLabel: "Playable"
    },
    {
      id: "2-clubs",
      label: "2-clubs",
      rank: "2",
      suit: "clubs",
      playable: false,
      ariaLabel: "Unavailable 2 of clubs",
      stateLabel: "Blocked"
    }
  ]);
  assert.equal(model.currentTrick, "player1:A-spades");
  assert.equal(model.lastTrick, "player1:2-clubs, player2:A-clubs | winner player2");
  assert.deepEqual(model.scoreRows[0], { seat: "player1", score: 10, tricks: 1 });
  assert.deepEqual(model.bidBagRows[1], { seat: "player2", bid: 3, bags: 0, ready: true });
});

test("visual shell model handles spectator or empty sanitized views", () => {
  const empty = buildVisualShellModel(null);

  assert.equal(empty.action, "No active room");
  assert.deepEqual(empty.handCards, []);

  const spectator = buildVisualShellModel({
    phase: "bidding",
    viewerSeat: "spectator",
    playerReady: { player1: true, player2: true },
    currentTurn: "player1",
    currentPlayerStatus: { canAct: false },
    biddingStatus: { nextBidder: "player1" },
    score: { player1: 0, player2: 0 },
    tricksTaken: { player1: 0, player2: 0 },
    bids: { player1: null, player2: null },
    bags: { player1: 0, player2: 0 },
    playableCardStatus: { cardIds: [] },
    hand: [],
    currentTrick: [],
    lastTrick: null
  });

  assert.equal(spectator.viewerSeat, "spectator");
  assert.equal(spectator.action, "Bid needed from player1");
  assert.deepEqual(spectator.handCards, []);
});

test("visual shell model sorts displayed hands by suit with spades first", () => {
  const model = buildVisualShellModel({
    phase: "playing",
    viewerSeat: "player1",
    playerReady: { player1: true, player2: true },
    currentTurn: "player1",
    currentPlayerStatus: { canAct: false },
    biddingStatus: { nextBidder: null },
    score: { player1: 0, player2: 0 },
    tricksTaken: { player1: 0, player2: 0 },
    bids: { player1: 0, player2: 0 },
    bags: { player1: 0, player2: 0 },
    playableCardStatus: { cardIds: [] },
    hand: [
      { rank: "2", suit: "clubs" },
      { rank: "A", suit: "hearts" },
      { rank: "10", suit: "diamonds" },
      { rank: "K", suit: "spades" },
      { rank: "A", suit: "spades" },
      { rank: "3", suit: "clubs" },
      { rank: "Q", suit: "spades" },
      { rank: "K", suit: "hearts" }
    ],
    currentTrick: [],
    lastTrick: null
  });

  assert.deepEqual(model.handCards.map((card) => card.id), [
    "A-spades",
    "K-spades",
    "Q-spades",
    "A-hearts",
    "K-hearts",
    "10-diamonds",
    "3-clubs",
    "2-clubs"
  ]);
});

test("visual shell models player1 player2 and spectator sanitized hands only", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "VIS001" });
  harness.setup();
  harness.readyBoth();
  harness.bidBoth({ hostBid: 4, guestBid: 3 });

  const hostModel = buildVisualShellModel(harness.statusForView("host"));
  const guestModel = buildVisualShellModel(harness.statusForView("guest"));
  const spectatorModel = buildVisualShellModel(harness.statusForView("spectator"));

  assert.equal(hostModel.viewerSeat, "player1");
  assert.equal(hostModel.handCards.length, 13);
  assert.equal(guestModel.viewerSeat, "player2");
  assert.equal(guestModel.handCards.length, 13);
  assert.equal(spectatorModel.viewerSeat, "spectator");
  assert.deepEqual(spectatorModel.handCards, []);
  assert.equal(hostModel.roomCode, "VIS001");
  assert.equal(guestModel.roomCode, "VIS001");
  assert.equal(spectatorModel.roomCode, "VIS001");
  assert.equal(hostModel.phase, guestModel.phase);
  assert.equal(hostModel.phase, spectatorModel.phase);
  assert.equal(hostModel.currentTurn, guestModel.currentTurn);
  assert.equal(hostModel.currentTurn, spectatorModel.currentTurn);

  const hostCards = new Set(hostModel.handCards.map((card) => card.id));
  const guestCards = new Set(guestModel.handCards.map((card) => card.id));
  assert.equal([...hostCards].some((id) => guestCards.has(id)), false);
});

test("visual shell keeps trick summaries public while hands stay private", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "VIS002" });
  harness.setup();
  harness.readyBoth();
  harness.bidBoth({ hostBid: 4, guestBid: 3 });

  const leader = harness.host.getActiveRoomStatus().currentTurn === "player1"
    ? harness.host
    : harness.guest;
  const leadCardId = leader.getPlayableCardStatus().cardIds[0];
  leader.submitPlayCardById({ cardId: leadCardId });

  const currentTricks = ["host", "guest", "spectator"].map((view) => (
    buildVisualShellModel(harness.statusForView(view)).currentTrick
  ));

  assert.equal(new Set(currentTricks).size, 1);
  assert.match(currentTricks[0], /player[12]:/);
  assert.equal(buildVisualShellModel(harness.statusForView("spectator")).handCards.length, 0);

  const follower = harness.host.getActiveRoomStatus().currentTurn === "player1"
    ? harness.host
    : harness.guest;
  follower.submitPlayCardById({ cardId: follower.getPlayableCardStatus().cardIds[0] });

  const lastTricks = ["host", "guest", "spectator"].map((view) => (
    buildVisualShellModel(harness.statusForView(view)).lastTrick
  ));

  assert.equal(new Set(lastTricks).size, 1);
  assert.match(lastTricks[0], /winner player[12]/);
  assert.equal(buildVisualShellModel(harness.statusForView("spectator")).handCards.length, 0);
});

test("visual QA report shows pass fail checks from sanitized views", () => {
  const harness = createTwoSeatManualHarness({ roomCode: "QA001" });
  harness.setup();
  harness.readyBoth();
  harness.bidBoth({ hostBid: 4, guestBid: 3 });

  const hostReport = buildVisualQaReport(harness.statusForView("host"), {
    localPlayerId: "player-local",
    displayName: "North",
    seatBinding: "player1",
    reconnectStatus: "player1 restored for QA001"
  });
  const spectatorReport = buildVisualQaReport(harness.statusForView("spectator"));
  const emptyReport = buildVisualQaReport(null);

  assert.equal(hostReport.overallPass, true);
  assert.equal(hostReport.contextMessages.length, 11);
  assert.equal(hostReport.contextMessages.find((check) => check.name === "transport mode").detail, "direct");
  assert.equal(hostReport.contextMessages.find((check) => check.name === "local player id").detail, "player-local");
  assert.equal(hostReport.contextMessages.find((check) => check.name === "display name").detail, "North");
  assert.equal(hostReport.contextMessages.find((check) => check.name === "seat binding").detail, "player1");
  assert.equal(hostReport.contextMessages.find((check) => check.name === "reconnect status").detail, "player1 restored for QA001");
  assert.equal(hostReport.contextMessages.at(-1).name, "match/history status");
  assert.equal(hostReport.checks.length, 8);
  assert.equal(hostReport.checks.every((check) => check.pass), true);
  assert.equal(spectatorReport.overallPass, true);
  assert.match(spectatorReport.checks.find((check) => check.name === "hidden hand protection").detail, /spectator hand 0/);
  assert.equal(emptyReport.overallPass, false);
  assert.equal(emptyReport.edgeMessages[0].name, "reconnect/restore state");
});

test("visual QA report classifies edge-state failure messages", () => {
  const cases = [
    ["It is not this player's bid turn", "Stale turn or wrong player action"],
    ["Bid must be 0 through 13", "Invalid bid"],
    ["Illegal Spades play", "Invalid card play"],
    ["Stale action expected bidding phase", "Stale phase"],
    ["Stale action expected player1 turn", "Stale turn"],
    ["Join this room before taking a player action", "Room full/spectator"],
    ["Match history can only record completed matches", "Match complete"],
    ["No active room session", "Reconnect/restore state"]
  ];

  for (const [message, expected] of cases) {
    assert.match(buildEdgeMessages(null, message)[0].message, new RegExp(expected));
  }
});
