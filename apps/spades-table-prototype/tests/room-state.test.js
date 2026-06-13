import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRoomAction,
  createRoom,
  joinRoom,
  leaveRoom,
  sanitizeRoomForViewer
} from "../src/room-state.js";

const PLAYER1_TOKEN = "p1-token";
const PLAYER2_TOKEN = "p2-token";

test("creates a room with player1 identity and sanitized public view", () => {
  const room = createRoom({
    roomCode: "SPADES",
    seatToken: PLAYER1_TOKEN,
    playerId: "device-1",
    displayName: "North"
  });
  const playerView = sanitizeRoomForViewer(room, { seatToken: PLAYER1_TOKEN });
  const spectatorView = sanitizeRoomForViewer(room, {});

  assert.equal(room.phase, "waiting");
  assert.equal(room.players.player1.displayName, "North");
  assert.equal(playerView.viewerSeat, "player1");
  assert.equal(playerView.alreadySeated, true);
  assert.equal(spectatorView.viewerSeat, "spectator");
  assert.equal(spectatorView.alreadySeated, false);
  assert.equal(playerView.players.player1.seatToken, undefined);
});

test("joins player2, restores already-seated viewers, and assigns spectators when full", () => {
  let room = createRoom({ seatToken: PLAYER1_TOKEN, playerId: "device-1" });
  const joined = joinRoom(room, {
    seatToken: PLAYER2_TOKEN,
    playerId: "device-2",
    displayName: "South"
  });
  room = joined.room;

  const restored = joinRoom(room, { seatToken: PLAYER2_TOKEN, playerId: "device-2" });
  const spectator = joinRoom(room, { seatToken: "third-token", playerId: "device-3" });

  assert.equal(joined.seat, "player2");
  assert.equal(joined.alreadySeated, false);
  assert.equal(restored.seat, "player2");
  assert.equal(restored.alreadySeated, true);
  assert.equal(spectator.seat, "spectator");
});

test("ready state starts a server-owned hand with coin flip, dealer, first player, and deal", () => {
  let room = readyStartedRoom();

  assert.equal(room.phase, "bidding");
  assert.equal(room.coinFlipWinner, "player2");
  assert.equal(room.dealer, "player2");
  assert.equal(room.firstPlayer, "player1");
  assert.equal(room.currentTurn, "player1");
  assert.equal(room.game.hands.player1.length, 13);
  assert.equal(room.game.hands.player2.length, 13);
  assert.equal(room.game.stock.length, 26);
});

test("bidding phase locks bids and moves to play phase", () => {
  let room = readyStartedRoom();

  room = applyRoomAction(room, { type: "bid", seatToken: PLAYER1_TOKEN, bid: 4 });
  assert.equal(room.phase, "bidding");
  assert.deepEqual(room.game.bids, { player1: 4, player2: null });

  room = applyRoomAction(room, { type: "bid", seatToken: PLAYER2_TOKEN, bid: 3 });
  assert.equal(room.phase, "playing");
  assert.equal(room.currentTurn, "player1");
  assert.deepEqual(room.game.bids, { player1: 4, player2: 3 });
});

test("play phase validates turn order, completes tricks, and preserves last trick summary", () => {
  let room = biddingCompleteRoom();
  const player1Card = room.game.hands.player1.find((card) => card.suit === "clubs");
  const player2Card = room.game.hands.player2.find((card) => card.suit === "clubs");

  assert.throws(() => applyRoomAction(room, {
    type: "playCard",
    seatToken: PLAYER2_TOKEN,
    card: player2Card
  }), /not this player's turn/);

  room = applyRoomAction(room, { type: "playCard", seatToken: PLAYER1_TOKEN, card: player1Card });
  assert.equal(room.currentTurn, "player2");
  assert.equal(room.game.currentTrick.length, 1);

  room = applyRoomAction(room, { type: "playCard", seatToken: PLAYER2_TOKEN, card: player2Card });
  assert.equal(room.game.currentTrick.length, 0);
  assert.equal(room.game.lastTrick.winner, "player2");
  assert.equal(room.game.lastTrick.plays.length, 2);
  assert.equal(room.game.tricksTaken.player2, 1);
});

test("sanitized views include only viewer hand and never leak hidden hands", () => {
  const room = biddingCompleteRoom();
  const player1View = sanitizeRoomForViewer(room, { seatToken: PLAYER1_TOKEN });
  const player2View = sanitizeRoomForViewer(room, { seatToken: PLAYER2_TOKEN });
  const spectatorView = sanitizeRoomForViewer(room, {});

  assert.equal(player1View.viewerSeat, "player1");
  assert.equal(player1View.hand.length, 13);
  assert.deepEqual(player1View.hand, room.game.hands.player1);
  assert.notDeepEqual(player1View.hand, room.game.hands.player2);
  assert.equal(player2View.hand.length, 13);
  assert.deepEqual(player2View.hand, room.game.hands.player2);
  assert.deepEqual(spectatorView.hand, []);
  assert.deepEqual(spectatorView.hiddenHandCounts, { player1: 13, player2: 13 });
});

test("follower must follow suit and spades breaking is tracked", () => {
  let room = biddingCompleteRoom();
  const player1Club = room.game.hands.player1.find((card) => card.suit === "clubs");
  const player2OffSuit = room.game.hands.player2.find((card) => card.suit === "diamonds");

  room = applyRoomAction(room, { type: "playCard", seatToken: PLAYER1_TOKEN, card: player1Club });

  assert.throws(() => applyRoomAction(room, {
    type: "playCard",
    seatToken: PLAYER2_TOKEN,
    card: player2OffSuit
  }), /Illegal Spades play/);

  room = biddingCompleteRoom({
    deck: noClubPlayer2Deck()
  });
  const leaderClub = room.game.hands.player1.find((card) => card.suit === "clubs");
  const offSuitSpade = room.game.hands.player2.find((card) => card.suit === "spades");

  room = applyRoomAction(room, { type: "playCard", seatToken: PLAYER1_TOKEN, card: leaderClub });
  room = applyRoomAction(room, { type: "playCard", seatToken: PLAYER2_TOKEN, card: offSuitSpade });

  assert.equal(room.game.spadesBroken, true);
  assert.equal(room.game.lastTrick.winner, "player2");
});

test("completes hand and match after thirteen tricks", () => {
  let room = biddingCompleteRoom({
    deck: player1WinsEveryTrickDeck(),
    matchSettings: { targetScore: 40 }
  });

  for (let trick = 0; trick < 13; trick += 1) {
    const leader = room.currentTurn;
    const follower = leader === "player1" ? "player2" : "player1";
    room = applyRoomAction(room, {
      type: "playCard",
      seatToken: tokenForSeat(leader),
      card: room.game.hands[leader][0]
    });
    room = applyRoomAction(room, {
      type: "playCard",
      seatToken: tokenForSeat(follower),
      card: room.game.hands[follower][0]
    });
  }

  assert.equal(room.phase, "match_complete");
  assert.equal(room.game.winner, "player1");
  assert.deepEqual(room.game.tricksTaken, { player1: 13, player2: 0 });
  assert.equal(room.game.score.player1, 49);
});

test("leave room marks the player disconnected without removing their seat", () => {
  let room = createRoom({ seatToken: PLAYER1_TOKEN, playerId: "device-1" });

  room = leaveRoom(room, { seatToken: PLAYER1_TOKEN });

  assert.equal(room.players.player1.connected, false);
  assert.equal(sanitizeRoomForViewer(room, { playerId: "device-1" }).viewerSeat, "player1");
});

function readyStartedRoom({ deck = player2HighDeck(), matchSettings = {}, coinFlipWinner = "player2" } = {}) {
  let room = createRoom({
    roomCode: "SPADES",
    seatToken: PLAYER1_TOKEN,
    playerId: "device-1",
    displayName: "North",
    coinFlipWinner,
    deck,
    matchSettings
  });
  room = joinRoom(room, {
    seatToken: PLAYER2_TOKEN,
    playerId: "device-2",
    displayName: "South"
  }).room;
  room = applyRoomAction(room, { type: "ready", seatToken: PLAYER1_TOKEN });
  return applyRoomAction(room, { type: "ready", seatToken: PLAYER2_TOKEN });
}

function biddingCompleteRoom(options = {}) {
  let room = readyStartedRoom(options);
  room = applyRoomAction(room, { type: "bid", seatToken: PLAYER1_TOKEN, bid: 4 });
  return applyRoomAction(room, { type: "bid", seatToken: PLAYER2_TOKEN, bid: 3 });
}

function tokenForSeat(seat) {
  return seat === "player1" ? PLAYER1_TOKEN : PLAYER2_TOKEN;
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

function noClubPlayer2Deck() {
  return [
    ...cards("clubs", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("spades", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("hearts", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"])
  ];
}

function player1WinsEveryTrickDeck() {
  return [
    ...cards("spades", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("clubs", ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"]),
    ...cards("hearts", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]),
    ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"])
  ];
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
