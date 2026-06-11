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
  assert.deepEqual(room.matchSettings, {
    modeId: "communityCompetitive",
    raceTo: 10,
    stickTheDealer: true
  });
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

test("Race To defaults to 5 for Fast Game and 10 otherwise", () => {
  const fastRoom = createRoom({ roomCode: "FAST5", modeId: "fastGame" });
  const regularRoom = createRoom({ roomCode: "TEN10", modeId: "communityCompetitive" });

  assert.equal(fastRoom.matchSettings.raceTo, 5);
  assert.equal(fastRoom.gameState.mode.targetScore, 5);
  assert.equal(sanitizeRoomForViewer(fastRoom, fastRoom.players.player1.seatToken).gameState.targetScore, 5);
  assert.equal(regularRoom.matchSettings.raceTo, 10);
  assert.equal(regularRoom.gameState.mode.targetScore, 10);
  assert.equal(sanitizeRoomForViewer(regularRoom, regularRoom.players.player1.seatToken).gameState.targetScore, 10);
});

test("explicit Race To 5 is saved on the room and ends match at 5", () => {
  let room = createStartedRoom({
    matchSettings: {
      modeId: "communityCompetitive",
      raceTo: 5,
      stickTheDealer: true
    }
  });
  const view = sanitizeRoomForViewer(room, "host-token");

  assert.equal(room.matchSettings.raceTo, 5);
  assert.equal(room.gameState.mode.targetScore, 5);
  assert.equal(view.matchSettings.raceTo, 5);
  assert.equal(view.gameState.targetScore, 5);

  room = {
    ...room,
    gameState: {
      ...room.gameState,
      score: { player1: 0, player2: 3 }
    }
  };
  room = orderUpHeartsAndDiscard(room);
  room = playFixedHand(room);

  assert.equal(room.gameState.phase, "match_complete");
  assert.equal(room.gameState.winner, "player2");
  assert.deepEqual(room.gameState.score, { player1: 0, player2: 5 });
  assert.equal(room.nextRoundStartsAt, null);
});

test("explicit Race To 10 does not end match at 5", () => {
  let room = createStartedRoom({
    matchSettings: {
      modeId: "communityCompetitive",
      raceTo: 10,
      stickTheDealer: true
    }
  });

  assert.equal(sanitizeRoomForViewer(room, "host-token").gameState.targetScore, 10);

  room = {
    ...room,
    gameState: {
      ...room.gameState,
      score: { player1: 0, player2: 3 }
    }
  };
  room = orderUpHeartsAndDiscard(room);
  room = playFixedHand(room);

  assert.equal(room.gameState.phase, "next_round_countdown");
  assert.equal(room.gameState.winner, null);
  assert.deepEqual(room.gameState.score, { player1: 0, player2: 5 });
  assert.equal(Boolean(room.nextRoundStartsAt), true);
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

test("invite link seating gives open Player 2 seat and third visitor is spectator", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });
  const secondBrowser = joinRoom(room, { seatToken: "guest-token" });

  assert.equal(secondBrowser.seat, "player2");
  assert.equal(secondBrowser.room.players.player2.seatToken, "guest-token");

  assert.throws(() => joinRoom(secondBrowser.room, { seatToken: "third-token" }), /two seated players/);
  const thirdView = sanitizeRoomForViewer(secondBrowser.room, "third-token");
  assert.equal(thirdView.viewerSeat, "spectator");
  assert.deepEqual(thirdView.gameState.viewerHand, []);
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

test("Player 1 alone can ready without starting countdown, coin flip, or deal", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });

  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });

  assert.equal(room.playerReady.player1, true);
  assert.equal(room.playerReady.player2, false);
  assert.equal(room.gameState.phase, "waiting_for_players");
  assert.equal(room.countdownStartedAt, null);
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.gameState.hands.player1.length, 0);
  assert.equal(room.gameState.hands.player2.length, 0);
  assert.equal(room.coinFlipWinner, null);
});

test("Player 1 can unready before Player 2 joins", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });
  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  room = applyRoomAction(room, { seatToken: "host-token", type: "unready" });

  assert.equal(room.playerReady.player1, false);
  assert.equal(room.gameState.phase, "waiting_for_players");
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.coinFlipWinner, null);
});

test("one-player room snapshots are forced back to waiting state with no start sequence", () => {
  const room = createRoom({
    roomCode: "ABCDE",
    seatToken: "host-token",
    coinFlipWinner: "player1"
  });
  const malformed = {
    ...room,
    coinFlipWinner: "player1",
    startingPositionChoice: "dealer",
    firstDealer: "player1",
    countdownStartedAt: new Date().toISOString(),
    countdownEndsAt: new Date(Date.now() + 5000).toISOString(),
    gameState: {
      ...room.gameState,
      phase: "coin_flip",
      actionPhase: "dealer_choice",
      currentTurn: "player1",
      dealer: "player1"
    }
  };

  const view = sanitizeRoomForViewer(malformed, "host-token");

  assert.equal(view.gameState.phase, "waiting_for_players");
  assert.equal(view.gameState.actionPhase, "waiting_for_players");
  assert.equal(view.coinFlipWinner, null);
  assert.equal(view.startingPositionChoice, null);
  assert.equal(view.firstDealer, null);
  assert.equal(view.gameState.currentTurn, null);
  assert.equal(view.gameState.dealer, null);
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

test("Player 1 ready before Player 2 joins waits for Player 2 ready to start countdown", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1" });

  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  room = joinRoom(room, { seatToken: "guest-token" }).room;

  assert.equal(room.playerReady.player1, true);
  assert.equal(room.playerReady.player2, false);
  assert.equal(room.gameState.phase, "pregame_settings");
  assert.equal(room.countdownEndsAt, null);
  assert.equal(room.coinFlipWinner, null);

  room = applyRoomAction(room, { seatToken: "guest-token", type: "ready" });

  assert.equal(room.gameState.phase, "ready_countdown");
  assert.equal(Boolean(room.countdownEndsAt), true);
  assert.equal(room.coinFlipWinner, null);
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

test("ordering up upcard adds it to dealer hand and waits for dealer discard", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: upcard.suit });

  assert.equal(room.gameState.hands.player2.length, 6);
  assert.equal(room.gameState.hands.player2.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), true);
  assert.equal(room.gameState.kitty.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), false);
  assert.equal(room.gameState.actionPhase, "dealer_discard");
  assert.equal(room.gameState.currentTurn, "player2");
  assert.equal(room.gameState.trumpSuit, upcard.suit);
  assert.equal(room.gameState.dealerPickup.dealer, "player2");
  assert.deepEqual(room.gameState.dealerPickup.upcard, upcard);
  assert.equal(room.gameState.dealerPickup.pending, true);
  assert.equal(room.gameState.dealerPickup.discarded, null);
});

test("dealer must discard before trick play can start", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: upcard.suit });

  assert.throws(
    () => applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "A", suit: "hearts" } }),
    /Expected phase playing/
  );
});

test("dealer discard returns hand to 5 and discarded card is not playable", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;
  const discarded = { rank: "9", suit: "clubs" };

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: upcard.suit });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "discard", card: discarded });

  assert.equal(room.gameState.hands.player2.length, 5);
  assert.equal(room.gameState.actionPhase, "playing");
  assert.equal(room.gameState.currentTurn, "player1");
  assert.equal(room.gameState.hands.player2.some((card) => card.rank === discarded.rank && card.suit === discarded.suit), false);
  assert.equal(room.gameState.kitty.some((card) => card.rank === discarded.rank && card.suit === discarded.suit), true);
  assert.deepEqual(room.gameState.dealerPickup.discarded, discarded);

  const opponentViewAfterDiscard = sanitizeRoomForViewer(room, "host-token");
  const spectatorViewAfterDiscard = sanitizeRoomForViewer(room, "spectator-token");
  assert.equal(opponentViewAfterDiscard.gameState.dealerPickup.discarded, "discarded");
  assert.equal(spectatorViewAfterDiscard.gameState.dealerPickup.discarded, "discarded");

  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });
  const dealerView = sanitizeRoomForViewer(room, "guest-token");
  assert.deepEqual(dealerView.gameState.dealerPickup.discarded, discarded);
  assert.equal(dealerView.gameState.viewerHand.some((card) => card.rank === discarded.rank && card.suit === discarded.suit), false);
  assert.equal(dealerView.gameState.playableCards.some((card) => card.rank === discarded.rank && card.suit === discarded.suit), false);
});

test("turning down upcard does not add it to dealer hand", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "passTrump" });

  assert.equal(room.gameState.trumpState.round, 2);
  assert.equal(room.gameState.hands.player2.length, 5);
  assert.equal(room.gameState.hands.player2.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), false);
  assert.equal(room.gameState.kitty.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), true);
});

test("round 2 trump choice does not add upcard", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "passTrump" });
  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: "spades" });

  assert.equal(room.gameState.actionPhase, "playing");
  assert.equal(room.gameState.trumpSuit, "spades");
  assert.equal(room.gameState.hands.player2.length, 5);
  assert.equal(room.gameState.hands.player2.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), false);
  assert.equal(room.gameState.kitty.some((card) => card.rank === upcard.rank && card.suit === upcard.suit), true);
});

test("non-dealer cannot discard for dealer", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: upcard.suit });

  assert.throws(
    () => applyRoomAction(room, { seatToken: "host-token", type: "discard", card: { rank: "A", suit: "clubs" } }),
    /Only the dealer can discard/
  );
});

test("dealer cannot discard a card they do not hold", () => {
  let room = createStartedRoom();
  const upcard = room.gameState.upcard;

  room = applyRoomAction(room, { seatToken: "host-token", type: "chooseTrump", suit: upcard.suit });

  assert.throws(
    () => applyRoomAction(room, { seatToken: "guest-token", type: "discard", card: { rank: "A", suit: "spades" } }),
    /do not hold/
  );
});

test("dealer rotates every hand across multiple hands", () => {
  let room = createStartedRoom();

  assert.equal(room.gameState.handNumber, 1);
  assert.equal(room.gameState.dealer, "player2");

  room = completeHandRoom(room);
  room = advanceRoomClock(room, { now: Date.parse(room.nextRoundStartsAt) + 1, deck: fixedDeck });

  assert.equal(room.gameState.handNumber, 2);
  assert.equal(room.gameState.dealer, "player1");

  room = orderUpHeartsAndDiscard(room, {
    chooserToken: "guest-token",
    dealerToken: "host-token",
    discard: { rank: "A", suit: "clubs" }
  });
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

test("completed trick preserves public lastTrick winning card summary", () => {
  let room = createStartedRoom();
  room = orderUpHeartsAndDiscard(room);
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "A", suit: "hearts" } });

  assert.equal(room.gameState.currentTrick.length, 0);
  assert.equal(room.gameState.completedTricks.length, 1);
  assert.equal(room.gameState.lastTrick.trickNumber, 1);
  assert.equal(room.gameState.lastTrick.winningSeat, "player1");
  assert.deepEqual(room.gameState.lastTrick.winningCard, { rank: "J", suit: "diamonds" });
  assert.equal(room.gameState.lastTrick.plays.length, 2);
  assert.deepEqual(room.gameState.lastTrick.plays.map((play) => play.seat), ["player1", "player2"]);
  assert.equal(typeof room.gameState.lastTrick.completedAt, "string");
  assert.equal(room.gameState.lastTrick.sequence, 1);
});

test("lastTrick is public-safe for spectators and clears when next trick starts", () => {
  let room = createStartedRoom();
  room = orderUpHeartsAndDiscard(room);
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });
  room = applyRoomAction(room, { seatToken: "guest-token", type: "playCard", card: { rank: "A", suit: "hearts" } });

  const spectatorView = sanitizeRoomForViewer(room, "spectator-token");
  assert.equal(spectatorView.viewerSeat, "spectator");
  assert.deepEqual(spectatorView.gameState.viewerHand, []);
  assert.equal(spectatorView.gameState.lastTrick.winningSeat, "player1");
  assert.deepEqual(spectatorView.gameState.lastTrick.winningCard, { rank: "J", suit: "diamonds" });
  assert.equal(JSON.stringify(spectatorView.gameState.lastTrick).includes("seatToken"), false);
  assert.equal(JSON.stringify(spectatorView.gameState.lastTrick).includes("discarded"), false);
  assert.equal(JSON.stringify(spectatorView.gameState.lastTrick).includes('"rank":"9","suit":"clubs"'), false);
  assert.equal(noRestrictedFields(spectatorView.gameState.lastTrick, ["hands", "kitty", "seatToken", "playerId", "accountId"]), true);

  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "9", suit: "spades" } });
  assert.equal(room.gameState.currentTrick.length, 1);
  assert.equal(room.gameState.lastTrick, null);
});

test("new hand clears lastTrick summary", () => {
  let room = completeHandRoom();
  assert.equal(room.gameState.currentTrick.length, 0);
  assert.equal(room.gameState.lastTrick.trickNumber, 5);
  assert.deepEqual(room.gameState.lastTrick.winningCard, { rank: "9", suit: "hearts" });

  room = advanceRoomClock(room, { now: Date.parse(room.nextRoundStartsAt) + 1, deck: fixedDeck });
  assert.equal(room.gameState.handNumber, 2);
  assert.equal(room.gameState.lastTrick, null);
  assert.equal(room.gameState.currentTrick.length, 0);
});

test("Quick Match rematch requires both players", () => {
  let room = createCompletedQuickMatchRoom();

  room = applyRoomAction(room, { seatToken: "host-token", type: "requestRematch" });
  assert.equal(room.gameState.phase, "match_complete");
  assert.equal(room.quickMatch.rematchVotes.player1, true);
  assert.equal(room.quickMatch.rematchVotes.player2, false);

  room = applyRoomAction(room, { seatToken: "guest-token", type: "requestRematch" });
  assert.equal(room.gameState.phase, "pregame_settings");
  assert.equal(room.gameState.actionPhase, "pregame_settings");
  assert.deepEqual(room.gameState.score, { player1: 0, player2: 0 });
  assert.equal(room.gameState.winner, null);
  assert.equal(room.quickMatch.rematchVotes.player1, false);
  assert.equal(room.quickMatch.rematchVotes.player2, false);
  assert.equal(room.leaderboardRecordedAt, null);
  assert.deepEqual(room.playerReady, { player1: false, player2: false });
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
  room = orderUpHeartsAndDiscard(room);
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

test("tournament match spectator view protects hidden hands", () => {
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
  assert.equal("hands" in view.gameState, false);
  assert.deepEqual(view.gameState.viewerHand, []);
  assert.deepEqual(view.gameState.playableCards, []);
  assert.equal(view.gameState.handCounts.player1, 5);
  assert.equal(view.gameState.handCounts.player2, 5);
});

test("refresh rejoin keeps the same player seat by token", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", deck: fixedDeck });
  room = joinRoom(room, { seatToken: "guest-token" }).room;

  const rejoined = joinRoom(room, { seatToken: "host-token" });
  assert.equal(rejoined.seat, "player1");
  assert.equal(rejoined.room.players.player1.seatToken, "host-token");
});

test("host reconnect with saved token does not become opponent", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", displayName: "Mehdi" });
  const rejoined = joinRoom(room, { seatToken: "host-token" });

  assert.equal(rejoined.seat, "player1");
  assert.equal(rejoined.seatToken, "host-token");
  assert.equal(rejoined.room.players.player2, null);
});

test("stable playerId blocks the same browser from taking opponent seat", () => {
  const room = createRoom({
    roomCode: "ABCDE",
    seatToken: "host-token",
    playerId: "host-player",
    displayName: "Mehdi"
  });

  const restored = joinRoom(room, { seatToken: "host-token", playerId: "host-player", displayName: "Different" });
  assert.equal(restored.seat, "player1");
  assert.equal(restored.room.players.player2, null);
  assert.throws(
    () => joinRoom(room, { seatToken: "new-token", playerId: "host-player", displayName: "Opponent" }),
    /already seated/
  );
  assert.throws(
    () => joinRoom(room, { playerId: "host-player", displayName: "Opponent" }),
    /already seated/
  );
});

test("account identity attaches to seats and cannot occupy both seats", () => {
  const room = createRoom({
    roomCode: "ABCDE",
    seatToken: "host-token",
    playerId: "host-player",
    accountId: "account-host",
    displayName: "Account Host"
  });

  assert.equal(room.players.player1.accountId, "account-host");
  assert.equal(sanitizeRoomForViewer(room, { accountId: "account-host" }).viewerSeat, "player1");
  assert.throws(
    () => joinRoom(room, {
      seatToken: "guest-token",
      playerId: "other-player",
      accountId: "account-host",
      displayName: "Other Host"
    }),
    (error) => {
      assert.match(error.message, /account is already seated/);
      assert.equal(error.code, "duplicate_seat");
      return true;
    }
  );

  const joined = joinRoom(room, {
    seatToken: "guest-token",
    playerId: "guest-player",
    accountId: "account-guest",
    displayName: "Account Guest"
  });
  assert.equal(joined.room.players.player2.accountId, "account-guest");
});

test("manual URL reload with saved playerId restores existing seat", () => {
  const room = createRoom({
    roomCode: "ABCDE",
    seatToken: "host-token",
    playerId: "host-player",
    displayName: "Mehdi",
    deck: fixedDeck
  });

  const restoredByPlayerId = sanitizeRoomForViewer(room, { playerId: "host-player" });
  assert.equal(restoredByPlayerId.viewerSeat, "player1");
  assert.equal(restoredByPlayerId.alreadySeated, true);
});

test("same display name cannot occupy both seats without a valid existing token", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", displayName: "Mehdi   Zerrad" });

  assert.throws(() => joinRoom(room, { displayName: " mehdi zerrad " }), /already seated/);
  assert.throws(() => joinRoom(room, { seatToken: "new-token", displayName: "MEHDI ZERRAD" }), /already seated/);
});

test("blocked account usernames cannot join as guest display names", () => {
  const room = createRoom({
    roomCode: "ABCDE",
    seatToken: "host-token",
    accountId: "account-host",
    displayName: "Mehdi Zerrad"
  });

  assert.throws(
    () => joinRoom(room, {
      playerId: "guest-device",
      displayName: "  1V1  ",
      blockedIdentityNames: ["1v1", "Mehdi Zerrad"]
    }),
    (error) => {
      assert.equal(error.code, "duplicate_name_or_account");
      assert.equal(error.message, "This account or name is already seated in this room.");
      return true;
    }
  );
});

test("reconnect restores active match state and prevents seat stealing", () => {
  let room = createStartedRoom();
  room = orderUpHeartsAndDiscard(room);
  room = applyRoomAction(room, { seatToken: "host-token", type: "playCard", card: { rank: "J", suit: "diamonds" } });

  const restoredHost = joinRoom(room, { seatToken: "host-token", displayName: "Not Host" });
  const restoredGuest = joinRoom(restoredHost.room, { seatToken: "guest-token", displayName: "Not Guest" });
  const hostView = sanitizeRoomForViewer(restoredGuest.room, "host-token");
  const guestView = sanitizeRoomForViewer(restoredGuest.room, "guest-token");

  assert.equal(restoredHost.seat, "player1");
  assert.equal(restoredGuest.seat, "player2");
  assert.equal(hostView.viewerSeat, "player1");
  assert.equal(guestView.viewerSeat, "player2");
  assert.equal(hostView.gameState.phase, "playing");
  assert.equal(hostView.gameState.actionPhase, "playing");
  assert.equal(hostView.gameState.trumpSuit, "hearts");
  assert.equal(hostView.gameState.dealer, "player2");
  assert.equal(hostView.gameState.handNumber, 1);
  assert.equal(hostView.gameState.currentTurn, "player2");
  assert.equal(hostView.gameState.currentTrick.length, 1);
  assert.equal(hostView.gameState.viewerHand.length, 4);
  assert.equal(guestView.gameState.viewerHand.length, 5);

  assert.throws(() => joinRoom(restoredGuest.room, { seatToken: "third-token", displayName: "Seat Thief" }), /two seated players/);
  const spectatorView = sanitizeRoomForViewer(restoredGuest.room, "third-token");
  assert.equal(spectatorView.viewerSeat, "spectator");
  assert.deepEqual(spectatorView.gameState.viewerHand, []);
  assert.deepEqual(spectatorView.gameState.playableCards, []);
});

test("spectator cannot ready up or act as player", () => {
  const room = createRoom({ roomCode: "ABCDE", seatToken: "host-token" });

  assert.throws(
    () => applyRoomAction(room, { seatToken: "spectator-token", type: "ready" }),
    /Join this room before taking a player action/
  );
  assert.throws(
    () => applyRoomAction(room, { seatToken: "spectator-token", type: "chooseTrump", suit: "hearts" }),
    /Join this room before taking a player action/
  );
});

test("ready and game actions require the matching playerId when a seat has one", () => {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", playerId: "host-player" });

  assert.throws(
    () => applyRoomAction(room, { seatToken: "host-token", playerId: "guest-player", type: "ready" }),
    /Player identity does not match/
  );
  assert.throws(
    () => applyRoomAction(room, { seatToken: "host-token", type: "ready" }),
    /Player identity does not match/
  );

  room = applyRoomAction(room, { seatToken: "host-token", playerId: "host-player", type: "ready" });
  assert.equal(room.playerReady.player1, true);
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

function createReadyCountdownRoom(options = {}) {
  let room = createRoom({ roomCode: "ABCDE", seatToken: "host-token", coinFlipWinner: "player1", ...options });
  room = joinRoom(room, { seatToken: "guest-token" }).room;
  room = applyRoomAction(room, { seatToken: "host-token", type: "ready" });
  return applyRoomAction(room, { seatToken: "guest-token", type: "ready" });
}

function createCoinFlipRoom(options = {}) {
  const room = createReadyCountdownRoom(options);
  return advanceRoomClock(room, { now: Date.parse(room.countdownEndsAt) + 1, deck: fixedDeck });
}

function createStartedRoom(options = {}) {
  let room = createCoinFlipRoom(options);
  return applyRoomAction(room, {
    seatToken: "host-token",
    type: "chooseStartingPosition",
    position: "non_dealer",
    deck: fixedDeck
  });
}

function completeHandRoom(room = createStartedRoom()) {
  room = orderUpHeartsAndDiscard(room);
  return playFixedHand(room);
}

function createCompletedQuickMatchRoom() {
  const joined = joinRoom(createRoom({ roomCode: "REMAT", seatToken: "host-token" }), {
    seatToken: "guest-token"
  }).room;

  return {
    ...joined,
    leaderboardRecordedAt: "2026-06-10T12:00:00.000Z",
    quickMatch: {
      source: "quick_match",
      autoRequeue: false,
      rematchVotes: {
        player1: false,
        player2: false
      },
      rematchReady: false
    },
    gameState: {
      ...joined.gameState,
      phase: "match_complete",
      actionPhase: "match_complete",
      winner: "player1",
      score: { player1: 5, player2: 3 }
    }
  };
}

function orderUpHeartsAndDiscard(
  room,
  {
    chooserToken = "host-token",
    dealerToken = "guest-token",
    discard = { rank: "9", suit: "clubs" }
  } = {}
) {
  room = applyRoomAction(room, { seatToken: chooserToken, type: "chooseTrump", suit: "hearts" });
  return applyRoomAction(room, { seatToken: dealerToken, type: "discard", card: discard });
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
