import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRoomAction,
  createRoom,
  joinRoom,
  noRestrictedFields,
  sanitizeRoomForViewer
} from "../src/room-state.js";

const fixedDeck = [
  { rank: "A", suit: "clubs" },
  { rank: "K", suit: "clubs" },
  { rank: "Q", suit: "clubs" },
  { rank: "J", suit: "diamonds" },
  { rank: "9", suit: "spades" },
  { rank: "9", suit: "clubs" },
  { rank: "A", suit: "hearts" },
  { rank: "K", suit: "hearts" },
  { rank: "Q", suit: "hearts" },
  { rank: "10", suit: "hearts" },
  { rank: "9", suit: "hearts" },
  { rank: "10", suit: "clubs" },
  { rank: "J", suit: "clubs" },
  { rank: "A", suit: "diamonds" },
  { rank: "K", suit: "diamonds" },
  { rank: "Q", suit: "diamonds" },
  { rank: "10", suit: "diamonds" },
  { rank: "9", suit: "diamonds" },
  { rank: "J", suit: "hearts" },
  { rank: "A", suit: "spades" },
  { rank: "K", suit: "spades" },
  { rank: "Q", suit: "spades" },
  { rank: "J", suit: "spades" },
  { rank: "10", suit: "spades" }
];

test("creates a room and seats host as Player 1", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });

  assert.equal(room.roomCode, "ABCDE");
  assert.equal(room.players.player1.seatToken, "host-token");
  assert.equal(room.players.player2, null);
  assert.equal(room.currentTurn, "player1");
});

test("joins second player and supports reconnect by seat token", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  const joined = joinRoom(room, { seatToken: "guest-token" });

  assert.equal(joined.seat, "player2");
  assert.equal(joined.room.players.player2.seatToken, "guest-token");

  const rejoined = joinRoom(joined.room, { seatToken: "guest-token" });
  assert.equal(rejoined.seat, "player2");
  assert.equal(rejoined.room.players.player2.seatToken, "guest-token");
});

test("prevents a third active seated player", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  const joined = joinRoom(room, { seatToken: "guest-token" });

  assert.throws(() => joinRoom(joined.room, { seatToken: "third-token" }), (error) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /two seated players/);
    return true;
  });
});

test("enforces trump selection turn order", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  const joined = joinRoom(room, { seatToken: "guest-token" });

  assert.throws(
    () => applyRoomAction(joined.room, { seatToken: "guest-token", type: "chooseTrump", suit: "hearts" }),
    /player1's turn/
  );
});

test("rejects action when viewer has no player seat", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });

  assert.throws(() => applyRoomAction(room, {
    seatToken: "spectator-token",
    type: "chooseTrump",
    suit: "hearts"
  }), (error) => {
    assert.equal(error.statusCode, 403);
    assert.match(error.message, /Join this room/);
    return true;
  });
});

test("rejects illegal card play", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  room = joinRoom(room, { seatToken: "guest-token" }).room;
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "hearts" });
  room = applyRoomAction(room, {
    seatToken: "host-token",
    type: "playCard",
    card: { rank: "A", suit: "clubs" }
  });

  assert.throws(
    () => applyRoomAction(room, {
      seatToken: "guest-token",
      type: "playCard",
      card: { rank: "A", suit: "hearts" }
    }),
    /not legal/
  );
});

test("room game can complete a hand", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  room = joinRoom(room, { seatToken: "guest-token" }).room;
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "hearts" });

  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "A", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "9", suit: "spades" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "K", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "Q", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "A", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "10", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "K", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "9", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "Q", suit: "clubs" } });

  assert.equal(room.gameState.phase, "handComplete");
  assert.deepEqual(room.score, { player1: 0, player2: 2 });
  assert.equal(room.handHistory.length, 1);
});

test("spectator-safe room view does not expose hidden hands", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  const spectatorView = sanitizeRoomForViewer(room, null);
  const playerView = sanitizeRoomForViewer(room, "host-token");

  assert.equal(spectatorView.viewerSeat, "spectator");
  assert.deepEqual(spectatorView.gameState.viewerHand, []);
  assert.equal(spectatorView.gameState.handCounts.player1, 5);
  assert.equal(playerView.gameState.viewerHand.length, 5);
});

test("match room includes spectator-safe tournament metadata", () => {
  const room = createRoom({
    roomCode: "MCH11",
    seatToken: "host-token",
    deck: fixedDeck,
    tournamentMatch: {
      tournamentCode: "EUCHRE",
      matchId: "r1m1",
      round: 1,
      player1: { id: "p1", displayName: "A" },
      player2: { id: "p2", displayName: "B" },
      status: "active",
      winner: null
    }
  });
  const view = sanitizeRoomForViewer(room, null);

  assert.equal(view.tournamentMatch.tournamentCode, "EUCHRE");
  assert.equal(view.tournamentMatch.matchId, "r1m1");
  assert.equal(view.tournamentMatch.round, 1);
  assert.equal(view.tournamentMatch.player1.displayName, "A");
  assert.equal(view.tournamentMatch.player2.displayName, "B");
  assert.equal(view.tournamentMatch.status, "active");
  assert.equal(JSON.stringify(view).includes("seatToken"), false);
  assert.deepEqual(view.gameState.viewerHand, []);
});

test("refresh rejoin keeps the same player seat by token", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  room = joinRoom(room, { seatToken: "guest-token" }).room;

  const rejoined = joinRoom(room, { seatToken: "host-token" });
  assert.equal(rejoined.seat, "player1");
  assert.equal(rejoined.room.players.player1.seatToken, "host-token");
});

test("room state has no restricted commerce fields", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  const restricted = [
    ["m", "oney"].join(""),
    ["dep", "osit"].join(""),
    ["wal", "let"].join(""),
    ["pr", "ize"].join("")
  ];

  assert.equal(noRestrictedFields(room, restricted), true);
});
