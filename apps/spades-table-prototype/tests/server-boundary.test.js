import test from "node:test";
import assert from "node:assert/strict";
import {
  SPADES_REQUEST_TYPES,
  createMockSpadesTransport,
  validateRequest
} from "../src/server-boundary.js";

test("server boundary defines request contracts for local transport actions", () => {
  assert.deepEqual(SPADES_REQUEST_TYPES, [
    "createRoom",
    "joinRoom",
    "ready",
    "bid",
    "playCard",
    "leaveRoom",
    "nextHand",
    "newMatch"
  ]);

  assert.equal(validateRequest({
    type: "createRoom",
    identity: { playerId: "host", seatToken: "seat-host" }
  }), true);
  assert.equal(validateRequest({
    type: "bid",
    roomCode: "BOUND1",
    identity: { playerId: "host", seatToken: "seat-host" },
    bid: 4,
    actionId: "BOUND1:player1:bid:1"
  }), true);
  assert.throws(() => validateRequest({ type: "bid", roomCode: "BOUND1", identity: { playerId: "host" }, bid: 4 }), /seatToken/);
  assert.throws(() => validateRequest({ type: "playCard", roomCode: "BOUND1", identity: { playerId: "host", seatToken: "seat-host" } }), /cardId/);
});

test("mock transport wraps create join ready and bid with sanitized responses", () => {
  const transport = createMockSpadesTransport();
  const created = transport.handle(createRequest({
    type: "createRoom",
    roomCode: "BOUND1",
    playerId: "host",
    seatToken: "seat-host",
    displayName: "Host"
  }));
  const joined = transport.handle(createRequest({
    type: "joinRoom",
    roomCode: "BOUND1",
    playerId: "guest",
    seatToken: "seat-guest",
    displayName: "Guest"
  }));
  const hostReady = transport.handle(createRequest({
    type: "ready",
    roomCode: "BOUND1",
    playerId: "host",
    seatToken: "seat-host",
    actionId: "BOUND1:player1:ready:1"
  }));
  const guestReady = transport.handle(createRequest({
    type: "ready",
    roomCode: "BOUND1",
    playerId: "guest",
    seatToken: "seat-guest",
    actionId: "BOUND1:player2:ready:1"
  }));
  const hostBid = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND1",
    playerId: "host",
    seatToken: "seat-host",
    bid: 4,
    actionId: "BOUND1:player1:bid:1"
  }));

  assert.equal(created.ok, true);
  assert.equal(created.view.viewerSeat, "player1");
  assert.equal(created.spectatorView.viewerSeat, "spectator");
  assert.deepEqual(created.spectatorView.hand, []);
  assert.equal(joined.view.viewerSeat, "player2");
  assert.equal(hostReady.actionId, "BOUND1:player1:ready:1");
  assert.equal(guestReady.view.phase, "bidding");
  assert.equal(guestReady.view.hand.length, 13);
  assert.deepEqual(guestReady.spectatorView.hand, []);
  assert.equal(hostBid.actionId, "BOUND1:player1:bid:1");
  assert.deepEqual(hostBid.view.bids, { player1: "locked", player2: null });
  assert.deepEqual(hostBid.spectatorView.hand, []);
  assert.deepEqual(hostBid.spectatorView.hiddenHandCounts, { player1: 13, player2: 13 });
});

test("boundary preserves action ids and blocks duplicate submissions without mutation", () => {
  const transport = readyBiddingTransport();

  const first = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND2",
    playerId: "host",
    seatToken: "seat-host",
    bid: 5,
    actionId: "BOUND2:player1:bid:7"
  }));
  const duplicate = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND2",
    playerId: "host",
    seatToken: "seat-host",
    bid: 6,
    actionId: "BOUND2:player1:bid:7"
  }));

  assert.equal(first.ok, true);
  assert.equal(first.actionId, "BOUND2:player1:bid:7");
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.actionId, "BOUND2:player1:bid:7");
  assert.deepEqual(duplicate.view.bids, { player1: "locked", player2: null });
  assert.equal(duplicate.view.appliedActionCount, first.view.appliedActionCount);
});

test("boundary returns stale turn and stale phase failures with public views", () => {
  const transport = readyBiddingTransport();

  const wrongBidder = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND2",
    playerId: "guest",
    seatToken: "seat-guest",
    bid: 3,
    actionId: "BOUND2:player2:bid:1"
  }));
  const hostBid = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND2",
    playerId: "host",
    seatToken: "seat-host",
    bid: 4,
    actionId: "BOUND2:player1:bid:1"
  }));
  const guestBid = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND2",
    playerId: "guest",
    seatToken: "seat-guest",
    bid: 3,
    actionId: "BOUND2:player2:bid:2"
  }));
  const staleBid = transport.handle(createRequest({
    type: "bid",
    roomCode: "BOUND2",
    playerId: "host",
    seatToken: "seat-host",
    bid: 2,
    actionId: "BOUND2:player1:bid:3"
  }));

  assert.equal(wrongBidder.ok, false);
  assert.equal(wrongBidder.statusCode, 403);
  assert.match(wrongBidder.error.message, /bid turn/);
  assert.deepEqual(wrongBidder.spectatorView.hand, []);
  assert.equal(hostBid.ok, true);
  assert.equal(guestBid.view.phase, "playing");
  assert.equal(staleBid.ok, false);
  assert.equal(staleBid.statusCode, 409);
  assert.match(staleBid.error.message, /Stale action expected bidding phase/);
  assert.deepEqual(staleBid.spectatorView.hand, []);
});

test("boundary play-card responses preserve action ids and hidden-hand protection", () => {
  const transport = playingTransport();
  const hostView = transport.handle(createRequest({
    type: "joinRoom",
    roomCode: "BOUND3",
    playerId: "visitor",
    seatToken: "seat-visitor"
  }));
  const leader = transport.repository.get("BOUND3").currentTurn;
  const leaderIdentity = leader === "player1"
    ? { playerId: "host", seatToken: "seat-host" }
    : { playerId: "guest", seatToken: "seat-guest" };
  const leadCardId = transport.repository.get("BOUND3").game.hands[leader][0];
  const lead = transport.handle(createRequest({
    type: "playCard",
    roomCode: "BOUND3",
    ...leaderIdentity,
    cardId: `${leadCardId.rank}-${leadCardId.suit}`,
    actionId: `BOUND3:${leader}:playCard:1`
  }));
  const duplicate = transport.handle(createRequest({
    type: "playCard",
    roomCode: "BOUND3",
    ...leaderIdentity,
    cardId: `${leadCardId.rank}-${leadCardId.suit}`,
    actionId: `BOUND3:${leader}:playCard:1`
  }));

  assert.equal(hostView.seat, "spectator");
  assert.equal(hostView.view.viewerSeat, "spectator");
  assert.deepEqual(hostView.view.hand, []);
  assert.equal(lead.ok, true);
  assert.equal(lead.actionId, `BOUND3:${leader}:playCard:1`);
  assert.equal(lead.view.hiddenHandCounts[leader], 12);
  assert.deepEqual(lead.spectatorView.hand, []);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.view.currentTrick.length, 1);
});

test("boundary supports leave next-hand and new-match request responses", () => {
  const transport = playingTransport({ roomCode: "BOUND4", targetScore: 40 });
  completeHandThroughBoundary(transport, "BOUND4");
  const room = transport.repository.get("BOUND4");
  const postHandPhase = room.phase;
  const nextType = postHandPhase === "match_complete" ? "newMatch" : "nextHand";
  const actionId = `BOUND4:player1:${nextType}:1`;

  const next = transport.handle(createRequest({
    type: nextType,
    roomCode: "BOUND4",
    playerId: "host",
    seatToken: "seat-host",
    actionId
  }));
  const left = transport.handle(createRequest({
    type: "leaveRoom",
    roomCode: "BOUND4",
    playerId: "host",
    seatToken: "seat-host",
    actionId: "BOUND4:player1:leaveRoom:1"
  }));

  assert.equal(next.ok, true);
  assert.equal(next.actionId, actionId);
  assert.match(next.view.phase, /waiting|bidding/);
  assert.deepEqual(next.spectatorView.hand, []);
  assert.equal(left.ok, true);
  assert.equal(left.actionId, "BOUND4:player1:leaveRoom:1");
  assert.equal(left.session, null);
  assert.equal(left.view.viewerSeat, "spectator");
});

function readyBiddingTransport({ roomCode = "BOUND2" } = {}) {
  const transport = createMockSpadesTransport();
  transport.handle(createRequest({ type: "createRoom", roomCode, playerId: "host", seatToken: "seat-host" }));
  transport.handle(createRequest({ type: "joinRoom", roomCode, playerId: "guest", seatToken: "seat-guest" }));
  transport.handle(createRequest({ type: "ready", roomCode, playerId: "host", seatToken: "seat-host", actionId: `${roomCode}:player1:ready:1` }));
  transport.handle(createRequest({ type: "ready", roomCode, playerId: "guest", seatToken: "seat-guest", actionId: `${roomCode}:player2:ready:1` }));
  return transport;
}

function playingTransport({ roomCode = "BOUND3", targetScore = 500 } = {}) {
  const transport = readyBiddingTransport({ roomCode });
  transport.repository.save({
    ...transport.repository.get(roomCode),
    matchSettings: {
      ...transport.repository.get(roomCode).matchSettings,
      targetScore
    }
  });
  transport.handle(createRequest({ type: "bid", roomCode, playerId: "host", seatToken: "seat-host", bid: 4, actionId: `${roomCode}:player1:bid:1` }));
  transport.handle(createRequest({ type: "bid", roomCode, playerId: "guest", seatToken: "seat-guest", bid: 3, actionId: `${roomCode}:player2:bid:1` }));
  return transport;
}

function completeHandThroughBoundary(transport, roomCode) {
  let playSequence = 1;
  while (transport.repository.get(roomCode).phase === "playing") {
    const room = transport.repository.get(roomCode);
    const seat = room.currentTurn;
    const playerId = seat === "player1" ? "host" : "guest";
    const seatToken = seat === "player1" ? "seat-host" : "seat-guest";
    const viewer = transport.handle(createRequest({
      type: "joinRoom",
      roomCode,
      playerId,
      seatToken
    }));
    const cardId = viewer.view.playableCardStatus.cardIds[0];
    transport.handle(createRequest({
      type: "playCard",
      roomCode,
      playerId,
      seatToken,
      cardId,
      actionId: `${roomCode}:${seat}:playCard:${playSequence}`
    }));
    playSequence += 1;
  }
}

function createRequest({
  playerId,
  seatToken,
  ...request
}) {
  return {
    requestId: request.requestId ?? `${request.type}-${Math.random().toString(36).slice(2)}`,
    ...request,
    identity: {
      playerId,
      seatToken
    }
  };
}
