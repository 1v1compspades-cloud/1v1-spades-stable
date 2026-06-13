import test from "node:test";
import assert from "node:assert/strict";
import { createSpadesAppController } from "../src/app-controller.js";
import { loadSavedActiveRoom } from "../src/local-room-session.js";

test("create room stores active session and returns sanitized status", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });

  const result = controller.createRoom({
    roomCode: "ROOM01",
    seatToken: "seat-1",
    displayName: "North"
  });

  assert.equal(result.session.roomCode, "ROOM01");
  assert.equal(result.session.seatToken, "seat-1");
  assert.equal(result.status.viewerSeat, "player1");
  assert.equal(result.status.players.player1.displayName, "North");
  assert.deepEqual(loadSavedActiveRoom(storage), result.session);
});

test("join room stores active session for player2", () => {
  const hostStorage = createMemoryStorage();
  const guestStorage = createMemoryStorage();
  const host = createSpadesAppController({
    storage: hostStorage,
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: guestStorage,
    createPlayerId: () => "device-guest"
  });

  host.createRoom({ roomCode: "ROOM02", seatToken: "seat-host" });
  const joined = guest.joinRoom({
    roomCode: "room02",
    seatToken: "seat-guest",
    displayName: "South"
  });

  assert.equal(joined.seat, "player2");
  assert.equal(joined.session.seat, "player2");
  assert.equal(joined.status.viewerSeat, "player2");
  assert.equal(loadSavedActiveRoom(guestStorage).seatToken, "seat-guest");
});

test("restore active room reconnects the saved seat", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  controller.createRoom({ roomCode: "ROOM03", seatToken: "seat-1" });

  const restored = controller.restoreActiveRoom();

  assert.equal(restored.session.roomCode, "ROOM03");
  assert.equal(restored.status.viewerSeat, "player1");
  assert.equal(restored.status.alreadySeated, true);
});

test("clear active room removes saved session", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  controller.createRoom({ roomCode: "ROOM04", seatToken: "seat-1" });

  const cleared = controller.clearActiveRoom();

  assert.equal(cleared.cleared.roomCode, "ROOM04");
  assert.equal(controller.getActiveRoomStatus(), null);
  assert.equal(loadSavedActiveRoom(storage), null);
});

test("ready player updates room status without leaking hidden hands", () => {
  const hostStorage = createMemoryStorage();
  const guestStorage = createMemoryStorage();
  const host = createSpadesAppController({
    storage: hostStorage,
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: guestStorage,
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "ROOM05", seatToken: "seat-host", coinFlipWinner: "player1" });
  guest.joinRoom({ roomCode: "ROOM05", seatToken: "seat-guest" });

  const hostReady = host.readyPlayer();
  const guestReady = guest.readyPlayer();
  const spectatorStatus = host.getRoomStatus("ROOM05");

  assert.equal(hostReady.status.playerReady.player1, true);
  assert.equal(guestReady.status.phase, "bidding");
  assert.equal(guestReady.status.hand.length, 13);
  assert.deepEqual(spectatorStatus.hand, []);
  assert.deepEqual(spectatorStatus.hiddenHandCounts, { player1: 13, player2: 13 });
});

test("leave room clears active session and marks the seat disconnected", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  controller.createRoom({ roomCode: "ROOM06", seatToken: "seat-1" });

  const result = controller.leaveRoom();

  assert.equal(result.room.players.player1.connected, false);
  assert.equal(loadSavedActiveRoom(storage), null);
});

test("bidding status shows next bidder and moves to play after both bids", () => {
  const hostStorage = createMemoryStorage();
  const guestStorage = createMemoryStorage();
  const host = createSpadesAppController({
    storage: hostStorage,
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: guestStorage,
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "BID001", seatToken: "seat-host", coinFlipWinner: "player1" });
  guest.joinRoom({ roomCode: "BID001", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  assert.equal(host.getBiddingStatus().nextBidder, "player1");

  const hostBid = host.submitBid({ bid: 4, actionSequence: 1 });
  assert.equal(hostBid.status.phase, "bidding");
  assert.equal(hostBid.status.biddingStatus.nextBidder, "player2");
  assert.deepEqual(hostBid.status.bids, { player1: "locked", player2: null });

  const guestBid = guest.submitBid({ bid: 3, actionSequence: 1 });
  assert.equal(guestBid.status.phase, "playing");
  assert.equal(guestBid.status.biddingStatus.complete, true);
  assert.equal(guestBid.status.biddingStatus.nextBidder, null);
});

test("duplicate and stale bid actions are protected by controller action ids", () => {
  const storage = createMemoryStorage();
  const controller = createSpadesAppController({
    storage,
    createPlayerId: () => "device-1"
  });
  const guest = createSpadesAppController({
    repository: controller.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-2"
  });
  controller.createRoom({ roomCode: "BID002", seatToken: "seat-1" });
  guest.joinRoom({ roomCode: "BID002", seatToken: "seat-2" });
  controller.readyPlayer();
  guest.readyPlayer();

  const firstBid = controller.submitBid({ bid: 5, actionSequence: 7 });
  const replayedBid = controller.submitBid({ bid: 5, actionSequence: 7 });

  assert.equal(replayedBid.room, firstBid.room);
  assert.deepEqual(replayedBid.status.bids, { player1: "locked", player2: null });
  assert.throws(() => controller.submitBid({ bid: 6, actionSequence: 8 }), /bid turn/);
});

test("wrong player cannot bid before their turn", () => {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "BID003", seatToken: "seat-host" });
  guest.joinRoom({ roomCode: "BID003", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  assert.throws(() => guest.submitBid({ bid: 3 }), /bid turn/);
  assert.equal(host.getBiddingStatus().nextBidder, "player1");
});

test("invalid bids and stale phase submissions return clear errors without corrupting state", () => {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });
  host.createRoom({ roomCode: "BID004", seatToken: "seat-host" });
  guest.joinRoom({ roomCode: "BID004", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  assert.throws(() => host.submitBid({ bid: 14 }), /0 through 13/);
  assert.deepEqual(host.getActiveRoomStatus().bids, { player1: null, player2: null });

  host.submitBid({ bid: 0 });
  const guestBid = guest.submitBid({ bid: 2 });

  assert.equal(guestBid.status.phase, "playing");
  assert.throws(() => host.submitBid({ bid: 1 }), /Stale action expected bidding phase/);
  assert.equal(host.getActiveRoomStatus().phase, "playing");
});

test("third visitor becomes spectator and receives public room-full status only", () => {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });
  const visitor = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-visitor"
  });
  host.createRoom({ roomCode: "FULL01", seatToken: "seat-host" });
  guest.joinRoom({ roomCode: "FULL01", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();

  const spectator = visitor.joinRoom({ roomCode: "FULL01", seatToken: "seat-visitor" });

  assert.equal(spectator.seat, "spectator");
  assert.equal(spectator.session, null);
  assert.equal(spectator.status.viewerSeat, "spectator");
  assert.equal(spectator.status.alreadySeated, false);
  assert.deepEqual(spectator.status.hand, []);
  assert.deepEqual(spectator.status.hiddenHandCounts, { player1: 13, player2: 13 });
});

test("play-card action updates current player status and playable card status", () => {
  const { host, guest } = playingControllers();
  const hostStatus = host.getActiveRoomStatus();

  assert.equal(host.getCurrentPlayerStatus().currentPlayer, "player1");
  assert.equal(host.getCurrentPlayerStatus().canAct, true);
  assert.equal(guest.getCurrentPlayerStatus().canAct, false);
  assert.equal(host.getPlayableCardStatus().count, 13);
  assert.equal(guest.getPlayableCardStatus().count, 13);

  const leadCard = hostStatus.hand.find((card) => card.suit === "clubs");
  const led = host.submitPlayCard({ card: leadCard, actionSequence: 1 });

  assert.equal(led.status.currentPlayerStatus.currentPlayer, "player2");
  assert.equal(led.status.currentPlayerStatus.canAct, false);
  assert.equal(guest.getCurrentPlayerStatus().canAct, true);
});

test("play-card action validates legal follow suit and does not corrupt state", () => {
  const { host, guest } = playingControllers();
  const leadCard = host.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  host.submitPlayCard({ card: leadCard, actionSequence: 1 });

  const illegalOffSuit = guest.getActiveRoomStatus().hand.find((card) => card.suit === "diamonds");

  assert.throws(() => guest.submitPlayCard({ card: illegalOffSuit, actionSequence: 1 }), /Illegal Spades play/);
  assert.equal(guest.getActiveRoomStatus().currentTrick.length, 1);
  assert.equal(guest.getActiveRoomStatus().hiddenHandCounts.player2, 13);
});

test("play-card action resolves trick and preserves public last trick summary", () => {
  const { host, guest } = playingControllers();
  const leadCard = host.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  host.submitPlayCard({ card: leadCard, actionSequence: 1 });
  const followCard = guest.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  const followed = guest.submitPlayCard({ card: followCard, actionSequence: 1 });
  const spectatorStatus = host.getRoomStatus("PLAY01");

  assert.equal(followed.status.currentTrick.length, 0);
  assert.equal(followed.status.lastTrick.plays.length, 2);
  assert.equal(followed.status.lastTrick.winner, "player2");
  assert.equal(followed.status.tricksTaken.player2, 1);
  assert.deepEqual(spectatorStatus.hand, []);
  assert.equal(spectatorStatus.lastTrick.winner, "player2");
});

test("play-card action can submit by text card id", () => {
  const { host } = playingControllers();
  const leadCard = host.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  const cardId = `${leadCard.rank}-${leadCard.suit}`;

  const result = host.submitPlayCardById({ cardId, actionSequence: 1 });

  assert.equal(result.status.currentTrick.length, 1);
  assert.equal(result.status.currentTrick[0].card.rank, leadCard.rank);
  assert.equal(result.status.hiddenHandCounts.player1, 12);
});

test("play-card by id reports invalid and unplayable card errors clearly", () => {
  const { host, guest } = playingControllers();

  assert.throws(() => host.submitPlayCardById({ cardId: "not-in-hand" }), /not in the current player's hand/);

  const leadCard = host.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  host.submitPlayCardById({ cardId: `${leadCard.rank}-${leadCard.suit}`, actionSequence: 1 });
  const offSuit = guest.getActiveRoomStatus().hand.find((card) => card.suit === "diamonds");

  assert.throws(() => guest.submitPlayCardById({
    cardId: `${offSuit.rank}-${offSuit.suit}`,
    actionSequence: 1
  }), /Illegal Spades play/);
});

test("duplicate play-card action is idempotent and stale turn is rejected", () => {
  const { host, guest } = playingControllers();
  const leadCard = host.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  const led = host.submitPlayCard({ card: leadCard, actionSequence: 9 });
  const replayed = host.submitPlayCard({ card: leadCard, actionSequence: 9 });

  assert.equal(replayed.room, led.room);
  assert.equal(replayed.status.currentTrick.length, 1);
  assert.equal(replayed.status.hiddenHandCounts.player1, 12);
  assert.throws(() => host.submitPlayCard({ card: host.getActiveRoomStatus().hand[0] }), /Stale action expected player1 turn/);

  const followCard = guest.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  const followed = guest.submitPlayCard({ card: followCard, actionSequence: 1 });

  assert.equal(followed.status.lastTrick.winner, "player2");
});

test("full hand can complete with score, bags, and hand summary", () => {
  const { host, guest } = playingControllers({
    deck: player1WinsEveryTrickDeck(),
    hostBid: 4,
    guestBid: 3
  });

  const completed = playFullHandWithControllers(host, guest);

  assert.equal(completed.status.phase, "hand_complete");
  assert.deepEqual(completed.status.tricksTaken, { player1: 13, player2: 0 });
  assert.deepEqual(completed.status.score, { player1: 49, player2: -30 });
  assert.deepEqual(completed.status.bags, { player1: 9, player2: 0 });
  assert.equal(completed.status.handSummary.players.player1.scoreChange, 49);
  assert.equal(completed.status.handSummary.players.player1.bags, 9);
  assert.equal(completed.status.handSummary.players.player2.scoreChange, -30);
});

test("nil scoring works in the hand summary", () => {
  const { host, guest } = playingControllers({
    deck: player1WinsEveryTrickDeck(),
    hostBid: 4,
    guestBid: 0
  });

  const completed = playFullHandWithControllers(host, guest);

  assert.equal(completed.status.phase, "hand_complete");
  assert.equal(completed.status.handSummary.players.player2.nilBid, true);
  assert.equal(completed.status.handSummary.players.player2.nilResult, "made");
  assert.equal(completed.status.handSummary.players.player2.scoreChange, 100);
  assert.equal(completed.status.score.player2, 100);
});

test("next hand starts cleanly and preserves match score", () => {
  const { host, guest } = playingControllers({
    deck: player1WinsEveryTrickDeck(),
    hostBid: 4,
    guestBid: 3
  });
  const completed = playFullHandWithControllers(host, guest);

  assert.equal(completed.status.phase, "hand_complete");

  const next = host.startNextHand({
    deck: player2HighDeck()
  });

  assert.equal(next.status.phase, "bidding");
  assert.equal(next.status.handNumber, 2);
  assert.deepEqual(next.status.score, { player1: 49, player2: -30 });
  assert.deepEqual(next.status.tricksTaken, { player1: 0, player2: 0 });
  assert.equal(next.status.lastTrick, null);
  assert.equal(next.status.handSummary, null);
  assert.equal(next.status.hiddenHandCounts.player1, 13);
});

test("match complete prevents next hand unless a new match is created", () => {
  const { host, guest } = playingControllers({
    deck: player1WinsEveryTrickDeck(),
    hostBid: 4,
    guestBid: 3,
    matchSettings: { targetScore: 40 }
  });
  const completed = playFullHandWithControllers(host, guest);

  assert.equal(completed.status.phase, "match_complete");
  assert.equal(completed.status.winner, "player1");
  assert.throws(() => host.startNextHand({ deck: player2HighDeck() }), /Stale action expected hand_complete phase/);
});

test("new match reset after match complete preserves seats and clears match state", () => {
  const { host, guest } = playingControllers({
    deck: player1WinsEveryTrickDeck(),
    hostBid: 4,
    guestBid: 3,
    matchSettings: { targetScore: 40 }
  });
  const completed = playFullHandWithControllers(host, guest);

  assert.equal(completed.status.phase, "match_complete");
  assert.equal(completed.status.winner, "player1");

  const reset = host.startNewMatch({ deck: player2HighDeck() });
  const guestStatus = guest.getActiveRoomStatus();

  assert.equal(reset.status.phase, "waiting");
  assert.equal(reset.status.players.player1.displayName, "Player 1");
  assert.equal(reset.status.players.player2.displayName, "Player 2");
  assert.deepEqual(reset.status.playerReady, { player1: false, player2: false });
  assert.deepEqual(reset.status.score, { player1: 0, player2: 0 });
  assert.deepEqual(reset.status.bags, { player1: 0, player2: 0 });
  assert.deepEqual(reset.status.bids, { player1: null, player2: null });
  assert.deepEqual(reset.status.tricksTaken, { player1: 0, player2: 0 });
  assert.equal(reset.status.handNumber, 0);
  assert.equal(reset.status.lastTrick, null);
  assert.equal(reset.status.handSummary, null);
  assert.equal(reset.status.winner, null);
  assert.deepEqual(reset.status.hand, []);
  assert.equal(guestStatus.viewerSeat, "player2");
  assert.equal(guestStatus.alreadySeated, true);
});

test("new match reset is rejected before match completion", () => {
  const waiting = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-waiting"
  });
  waiting.createRoom({ roomCode: "RESET1", seatToken: "seat-waiting" });

  assert.throws(() => waiting.startNewMatch(), /Stale action expected match_complete phase/);

  const { host } = playingControllers();
  assert.throws(() => host.startNewMatch(), /Stale action expected match_complete phase/);

  const leadCard = host.getActiveRoomStatus().hand.find((card) => card.suit === "clubs");
  host.submitPlayCard({ card: leadCard, actionSequence: 1 });

  assert.throws(() => host.startNewMatch(), /Stale action expected match_complete phase/);
});

test("local match history records immutable completed match summaries", () => {
  const { host, guest } = playingControllers({
    deck: player1WinsEveryTrickDeck(),
    hostBid: 4,
    guestBid: 0,
    matchSettings: { targetScore: 90 }
  });
  const completed = playFullHandWithControllers(host, guest);

  assert.equal(completed.status.phase, "match_complete");
  assert.equal(completed.status.winner, "player2");

  const entry = host.recordMatchHistory({ timestamp: "2026-06-13T12:00:00.000Z" });

  assert.equal(entry.winner, "player2");
  assert.deepEqual(entry.finalScore, { player1: 49, player2: 100 });
  assert.deepEqual(entry.bids, { player1: 4, player2: 0 });
  assert.deepEqual(entry.bags, { player1: 9, player2: 0 });
  assert.deepEqual(entry.nilResults, { player1: null, player2: "made" });
  assert.equal(entry.timestamp, "2026-06-13T12:00:00.000Z");
  assert.throws(() => {
    entry.finalScore.player1 = 0;
  }, /Cannot assign/);

  const listed = host.getMatchHistory();
  assert.throws(() => {
    listed[0].finalScore.player2 = -1;
  }, /Cannot assign/);

  assert.deepEqual(host.getMatchHistory()[0].finalScore, { player1: 49, player2: 100 });

  const waiting = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-waiting-history"
  });
  waiting.createRoom({ roomCode: "HIST01", seatToken: "seat-history" });

  assert.throws(() => waiting.recordMatchHistory(), /completed matches/);
});

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function playingControllers({ deck = player2HighDeck(), hostBid = 4, guestBid = 3, matchSettings = {} } = {}) {
  const host = createSpadesAppController({
    storage: createMemoryStorage(),
    createPlayerId: () => "device-host"
  });
  const guest = createSpadesAppController({
    repository: host.repository,
    storage: createMemoryStorage(),
    createPlayerId: () => "device-guest"
  });

  host.createRoom({
    roomCode: "PLAY01",
    seatToken: "seat-host",
    coinFlipWinner: "player2",
    deck,
    matchSettings
  });
  guest.joinRoom({ roomCode: "PLAY01", seatToken: "seat-guest" });
  host.readyPlayer();
  guest.readyPlayer();
  host.submitBid({ bid: hostBid });
  guest.submitBid({ bid: guestBid });

  return { host, guest };
}

function playFullHandWithControllers(host, guest) {
  let latest = null;
  while (host.getActiveRoomStatus().phase === "playing") {
    const active = host.getActiveRoomStatus().currentTurn === "player1" ? host : guest;
    const cardId = active.getPlayableCardStatus().cardIds[0];
    latest = active.submitPlayCardById({ cardId });
  }
  return latest;
}

function player1WinsEveryTrickDeck() {
  return [
    ...cards("spades", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("clubs", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("hearts", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"])
  ];
}

function player2HighDeck() {
  return orderedDeck({
    player1Cards: [
      ...cards("clubs", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]),
      { rank: "2", suit: "hearts" }
    ],
    player2Cards: [
      { rank: "A", suit: "clubs" },
      ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"])
    ]
  });
}

function cards(suit, ranks) {
  return ranks.map((rank) => ({ rank, suit }));
}

function orderedDeck({ player1Cards, player2Cards }) {
  const used = new Set([...player1Cards, ...player2Cards].map((card) => `${card.rank}-${card.suit}`));
  const stock = ["clubs", "diamonds", "hearts", "spades"].flatMap((suit) => (
    ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
      .map((rank) => ({ rank, suit }))
      .filter((card) => !used.has(`${card.rank}-${card.suit}`))
  ));

  return [...player1Cards, ...player2Cards, ...stock];
}
