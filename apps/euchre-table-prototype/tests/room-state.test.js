import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRoomClock,
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

test("creates a room with no cards dealt and no coin flip before Player 2 joins", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });

  assert.equal(room.roomCode, "ABCDE");
  assert.equal(room.players.player1.seatToken, "host-token");
  assert.equal(room.players.player2, null);
  assert.equal(room.coinFlipWinner, null);
  assert.equal(room.firstDealer, null);
  assert.equal(room.gameState.dealer, null);
  assert.equal(room.currentTurn, null);
  assert.equal(room.gameState.phase, "waiting_for_players");
  assert.deepEqual(room.gameState.hands.player1, []);
  assert.deepEqual(room.gameState.hands.player2, []);
});

test("joins second player and supports reconnect by seat token", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1" });
  const joined = joinRoom(room, { seatToken: "guest-token" });

  assert.equal(joined.seat, "player2");
  assert.equal(joined.room.players.player2.seatToken, "guest-token");
  assert.equal(joined.room.coinFlipWinner, null);

  const rejoined = joinRoom(joined.room, { seatToken: "guest-token" });
  assert.equal(rejoined.seat, "player2");
  assert.equal(rejoined.room.players.player2.seatToken, "guest-token");
  assert.equal(rejoined.room.gameState.phase, "pregame_settings");
  assert.equal(rejoined.room.gameState.hands.player1.length, 0);
});

test("coin flip appears only after both players are seated and ready countdown completes", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });
  assert.equal(room.coinFlipWinner, null);
  assert.equal(room.gameState.phase, "waiting_for_players");

  room = joinRoom(room, { seatToken: "guest-token" }).room;

  assert.equal(room.coinFlipWinner, null);
  assert.equal(room.gameState.phase, "pregame_settings");

  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "ready" });
  room = advanceRoomClock(room, { now: Date.parse(room.countdownEndsAt) + 1 });

  assert.equal(["player1", "player2"].includes(room.coinFlipWinner), true);
  assert.equal(room.gameState.phase, "coin_flip");
  assert.equal(room.gameState.actionPhase, "dealer_choice");
  assert.deepEqual(room.gameState.hands.player1, []);
});

test("coin flip winner receives choice and assigns first dealer", () => {
  let room = createCoinFlipRoom();

  assert.throws(() => applyRoomAction(room, {
    seatToken: "guest-token",
    type: "chooseStartingPosition",
    position: "dealer"
  }), /Only the coin flip winner/);

  room = applyRoomAction(room, {
    seatToken: "host-token",
    type: "chooseStartingPosition",
    position: "dealer",
    deck: fixedDeck
  });

  assert.equal(room.startingPositionChoice, "dealer");
  assert.equal(room.firstDealer, "player1");
  assert.equal(room.gameState.dealer, "player1");
  assert.equal(room.gameState.phase, "playing");
  assert.equal(room.gameState.hands.player1.length, 5);
});

test("coin flip winner can choose first non-dealer", () => {
  let room = createCoinFlipRoom();
  room = applyRoomAction(room, {
    seatToken: "host-token",
    type: "chooseStartingPosition",
    position: "non_dealer",
    deck: fixedDeck
  });

  assert.equal(room.startingPositionChoice, "non_dealer");
  assert.equal(room.firstDealer, "player2");
  assert.equal(room.gameState.dealer, "player2");
  assert.equal(room.gameState.phase, "playing");
});

test("ready is allowed before coin flip and dealer choice", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1" });
  room = joinRoom(room, { seatToken: "guest-token" }).room;

  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });

  assert.equal(room.playerReady.player1, true);
  assert.equal(room.coinFlipWinner, null);
  assert.equal(room.firstDealer, null);
});

test("Player 1 alone cannot ready, start, or deal cards", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });

  assert.throws(() => applyRoomAction(room, { seatToken: "host-token", type: "ready" }), /Ready is only available/);
  assert.equal(room.gameState.phase, "waiting_for_players");
  assert.equal(room.gameState.hands.player1.length, 0);
  assert.equal(room.coinFlipWinner, null);
});

test("Player 1 ready without Player 2 ready does not deal cards", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1" });
  room = joinRoom(room, { seatToken: "guest-token" }).room;

  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });

  assert.equal(room.playerReady.player1, true);
  assert.equal(room.playerReady.player2, false);
  assert.equal(room.gameState.phase, "pregame_settings");
  assert.equal(room.gameState.hands.player1.length, 0);
  assert.equal(room.countdownEndsAt, null);
});

test("both players ready triggers countdown without dealing immediately", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1" });
  room = joinRoom(room, { seatToken: "guest-token" }).room;
  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "ready" });

  assert.equal(room.gameState.phase, "ready_countdown");
  assert.equal(Boolean(room.countdownEndsAt), true);
  assert.equal(room.coinFlipWinner, null);
  assert.equal(room.gameState.hands.player1.length, 0);
  assert.equal(room.gameState.hands.player2.length, 0);
});

test("countdown expiry triggers coin flip without dealing yet", () => {
  let room = createReadyCountdownRoom();
  const afterCountdown = Date.parse(room.countdownEndsAt) + 1;

  room = advanceRoomClock(room, { now: afterCountdown, deck: fixedDeck });

  assert.equal(room.gameState.phase, "coin_flip");
  assert.equal(room.gameState.actionPhase, "dealer_choice");
  assert.equal(room.coinFlipWinner, "player1");
  assert.equal(room.gameState.currentTurn, "player1");
  assert.equal(room.gameState.hands.player1.length, 0);
  assert.equal(room.gameState.hands.player2.length, 0);
  assert.equal(room.countdownEndsAt, null);
});

test("dealer choice happens before deal and starts gameplay", () => {
  let room = createCoinFlipRoom();

  assert.equal(room.gameState.phase, "coin_flip");
  assert.equal(room.gameState.hands.player1.length, 0);
  assert.equal(room.gameState.hands.player2.length, 0);

  room = applyRoomAction(room, {
    seatToken: "host-token",
    type: "chooseStartingPosition",
    position: "dealer",
    deck: fixedDeck
  });

  assert.equal(room.gameState.phase, "playing");
  assert.equal(room.gameState.actionPhase, "selectingTrump");
  assert.equal(room.gameState.dealer, "player1");
  assert.equal(room.gameState.hands.player1.length, 5);
  assert.equal(room.gameState.hands.player2.length, 5);
});

test("countdown does not duplicate during polling", () => {
  let room = createReadyCountdownRoom();
  const firstEndsAt = room.countdownEndsAt;

  room = advanceRoomClock(room, { now: Date.parse(firstEndsAt) - 1000 });
  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });

  assert.equal(room.countdownEndsAt, firstEndsAt);
  assert.equal(room.gameState.phase, "ready_countdown");
});

test("non-dealer acts first and dealer acts second during trump selection", () => {
  let room = createStartedRoom();

  assert.equal(room.gameState.dealer, "player2");
  assert.equal(room.gameState.currentTurn, "player1");

  room = applyRoomAction(room, { seatToken: "host-token", type: "passTrump" });

  assert.equal(room.gameState.currentTurn, "player2");
});

test("dealer picks up upcard and discards when upcard suit is ordered", () => {
  let room = createStartedRoom();
  const dealerHandBefore = room.gameState.hands.player2;
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: upcard.suit });

  assert.equal(room.gameState.hands.player2.length, 5);
  assert.equal(room.gameState.hands.player2.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), true);
  assert.equal(room.gameState.kitty.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), false);
  assert.equal(room.gameState.dealerPickup.dealer, "player2");
  assert.deepEqual(room.gameState.dealerPickup.upcard, upcard);
  assert.deepEqual(room.gameState.dealerPickup.discarded, dealerHandBefore[0]);
});

test("dealer rotates every hand across multiple hands", () => {
  let room = createStartedRoom();

  assert.equal(room.gameState.handNumber, 1);
  assert.equal(room.gameState.dealer, "player2");

  room = completeHandRoom(room);
  room = advanceRoomClock(room, { now: Date.parse(room.nextRoundStartsAt) + 1, deck: fixedDeck });

  assert.equal(room.gameState.handNumber, 2);
  assert.equal(room.gameState.dealer, "player1");

  room = applyRoomAction(room, { seatToken: "guest-token", type: "chooseTrump", suit: "hearts" });
  room = playFixedHandWithPlayer2Lead(room);
  room = advanceRoomClock(room, { now: Date.parse(room.nextRoundStartsAt) + 1, deck: fixedDeck });

  assert.equal(room.gameState.handNumber, 3);
  assert.equal(room.gameState.dealer, "player2");
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
  const room = createStartedRoom();

  assert.throws(
    () => applyRoomAction(room, { seatToken: "guest-token", type: "chooseTrump", suit: "hearts" }),
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
  let room = createStartedRoom();
  room = applyRoomAction(room, { seatToken: "host-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "spades" });
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

test("player can throw off only when void in the led suit", () => {
  let room = createStartedRoom();
  room = applyRoomAction(room, { seatToken: "host-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "spades" });
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

  room = applyRoomAction(room, {
    seatToken: "guest-token",
    type: "playCard",
    card: { rank: "9", suit: "clubs" }
  });
  room = applyRoomAction(room, {
    seatToken: "host-token",
    type: "playCard",
    card: { rank: "J", suit: "diamonds" }
  });
  room = applyRoomAction(room, {
    seatToken: "guest-token",
    type: "playCard",
    card: { rank: "A", suit: "hearts" }
  });

  assert.equal(room.gameState.completedTricks.length, 2);
});

test("both players can pass upcard and choose second-round trump", () => {
  let room = createStartedRoom();
  const upcardSuit = room.gameState.upcard.suit;

  room = applyRoomAction(room, { seatToken: "host-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "passTrump" });

  assert.equal(room.gameState.trumpState.round, 2);
  assert.equal(room.gameState.trumpSuit, null);
  assert.equal(room.gameState.currentTurn, "player1");
  assert.equal(room.gameState.trumpState.upcardSuit, upcardSuit);

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "spades" });
  const view = sanitizeRoomForViewer(room, "host-token");

  assert.equal(view.gameState.phase, "playing");
  assert.equal(view.gameState.actionPhase, "playing");
  assert.equal(view.gameState.trumpSuit, "spades");
  assert.equal(view.gameState.trumpState.trumpSuit, "spades");
  assert.notEqual(view.gameState.trumpSuit, null);
});

test("room game can complete a hand", () => {
  const room = completeHandRoom();

  assert.equal(room.gameState.phase, "next_round_countdown");
  assert.deepEqual(room.score, { player1: 0, player2: 2 });
  assert.equal(room.handHistory.length, 1);
  assert.equal(Boolean(room.nextRoundStartsAt), true);
});

test("next hand auto-starts after score phase if match is not complete", () => {
  let room = completeHandRoom();
  const nextHandAt = Date.parse(room.nextRoundStartsAt) + 1;

  room = advanceRoomClock(room, { now: nextHandAt, deck: fixedDeck });

  assert.equal(room.gameState.phase, "playing");
  assert.equal(room.gameState.actionPhase, "selectingTrump");
  assert.equal(room.gameState.handNumber, 2);
  assert.equal(room.nextRoundStartsAt, null);
  assert.equal(room.gameState.hands.player1.length, 5);
});

test("next hand does not auto-start when match target is reached", () => {
  let room = createStartedRoom();
  room = {
    ...room,
    gameState: {
      ...room.gameState,
      score: { player1: 0, player2: 8 },
      mode: {
        ...room.gameState.mode,
        targetScore: 10
      }
    }
  };
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "hearts" });
  room = playFixedHand(room);

  assert.equal(room.gameState.phase, "match_complete");
  assert.equal(room.gameState.winner, "player2");
  assert.equal(room.nextRoundStartsAt, null);
  assert.equal(advanceRoomClock(room, { now: Date.now() + 6000, deck: fixedDeck }).gameState.phase, "match_complete");
});

test("spectator-safe room view does not expose hidden hands", () => {
  const room = createStartedRoom();
  const spectatorView = sanitizeRoomForViewer(room, null);
  const playerView = sanitizeRoomForViewer(room, "host-token");

  assert.equal(spectatorView.viewerSeat, "spectator");
  assert.deepEqual(spectatorView.gameState.viewerHand, []);
  assert.equal(spectatorView.gameState.handCounts.player1, 5);
  assert.equal(playerView.gameState.viewerHand.length, 5);
});

test("match room includes spectator-safe tournament metadata", () => {
  let room = createRoom({
    roomCode: "MCH11",
    seatToken: "host-token",
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
  room = joinRoom(room, { seatToken: "guest-token" }).room;
  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "ready" });
  room = advanceRoomClock(room, { now: Date.parse(room.countdownEndsAt) + 1, deck: fixedDeck });
  room = applyRoomAction(room, {
    seatToken: room.coinFlipWinner === "player1" ? "host-token" : "guest-token",
    type: "chooseStartingPosition",
    position: "dealer",
    deck: fixedDeck
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

function createReadyCountdownRoom() {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1" });
  room = joinRoom(room, { seatToken: "guest-token" }).room;
  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  return applyRoomAction(room, { seatToken: "guest-token", type: "ready" });
}

function createCoinFlipRoom() {
  const room = createReadyCountdownRoom();
  return advanceRoomClock(room, { now: Date.parse(room.countdownEndsAt) + 1, deck: fixedDeck });
}

function createStartedRoom() {
  let room = createCoinFlipRoom();
  return applyRoomAction(room, {
    seatToken: "host-token",
    type: "chooseStartingPosition",
    position: "non_dealer",
    deck: fixedDeck
  });
}

function completeHandRoom(room = createStartedRoom()) {
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "hearts" });
  return playFixedHand(room);
}

function playFixedHand(room) {
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "A", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "9", suit: "spades" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "K", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "Q", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "A", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "10", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "K", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "9", suit: "hearts" } });
  return applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "Q", suit: "clubs" } });
}

function playFixedHandWithPlayer2Lead(room) {
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "A", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "K", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "9", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "Q", suit: "clubs" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "K", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "Q", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "9", suit: "hearts" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "10", suit: "hearts" } });
  return applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "9", suit: "spades" } });
}
