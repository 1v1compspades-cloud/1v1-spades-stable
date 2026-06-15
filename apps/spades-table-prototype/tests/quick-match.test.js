import test from "node:test";
import assert from "node:assert/strict";
import { createQuickMatchQueue } from "../src/quick-match.js";
import { createSpadesServerBoundary } from "../src/server-boundary.js";

test("quick match pairs two players into a sanitized room", () => {
  const queue = createQuickMatchQueue({
    boundary: createSpadesServerBoundary(),
    createRoomCode: () => "QMTEST"
  });

  const first = queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "q1"));
  const second = queue.joinQueue(request("joinQueue", "guest", "seat-guest", "Guest", "q2"));

  assert.equal(first.queue.state, "waiting");
  assert.equal(second.queue.state, "matched");
  assert.equal(second.match.roomCode, "QMTEST");
  assert.equal(second.view.viewerSeat, "player2");
  assert.equal(second.match.player1.response.view.viewerSeat, "player1");
  assert.equal(second.match.player2.response.view.viewerSeat, "player2");
  assert.deepEqual(second.spectatorView.hand, []);
});

test("quick match does not queue the same player twice and supports duplicate action ids", () => {
  const queue = createQuickMatchQueue({ boundary: createSpadesServerBoundary() });
  const first = queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "same-action"));
  const duplicate = queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "same-action"));
  const secondAttempt = queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "new-action"));

  assert.equal(first.queue.state, "waiting");
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.queue.waitingCount, 1);
  assert.equal(secondAttempt.queue.waitingCount, 1);
  assert.equal(queue.waitingPlayers().length, 1);
});

test("quick match blocks self-match even with a new seat token", () => {
  const queue = createQuickMatchQueue({ boundary: createSpadesServerBoundary() });
  const first = queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "self-1"));
  const selfAttempt = queue.joinQueue(request("joinQueue", "host", "seat-host-2", "Host Clone", "self-2"));
  const guest = queue.joinQueue(request("joinQueue", "guest", "seat-guest", "Guest", "guest-1"));

  assert.equal(first.queue.state, "waiting");
  assert.equal(selfAttempt.queue.state, "waiting");
  assert.equal(selfAttempt.queue.waitingCount, 1);
  assert.equal(queue.waitingPlayers().length, 0);
  assert.equal(guest.queue.state, "matched");
  assert.equal(guest.view.viewerSeat, "player2");
});

test("quick match uses the supplied deck factory for the matched room", () => {
  const deck = Array.from({ length: 52 }, (_, index) => {
    const suits = ["clubs", "diamonds", "hearts", "spades"];
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    return { rank: ranks[Math.floor(index / 4)], suit: suits[index % 4] };
  });
  const boundary = createSpadesServerBoundary();
  const queue = createQuickMatchQueue({
    boundary,
    createRoomCode: () => "QMSHUF",
    createDeck: () => deck
  });

  queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "q-host"));
  const matched = queue.joinQueue(request("joinQueue", "guest", "seat-guest", "Guest", "q-guest"));
  const room = boundary.repository.get("QMSHUF");

  assert.equal(matched.queue.state, "matched");
  assert.deepEqual(
    room.pendingDeck.slice(0, 13).map((card) => card.suit),
    ["clubs", "diamonds", "hearts", "spades", "clubs", "diamonds", "hearts", "spades", "clubs", "diamonds", "hearts", "spades", "clubs"]
  );
});

test("quick match leave queue is safe and idempotent", () => {
  const queue = createQuickMatchQueue({ boundary: createSpadesServerBoundary() });
  queue.joinQueue(request("joinQueue", "host", "seat-host", "Host", "join-1"));

  const left = queue.leaveQueue(request("leaveQueue", "host", "seat-host", "Host", "leave-1"));
  const duplicate = queue.leaveQueue(request("leaveQueue", "host", "seat-host", "Host", "leave-1"));

  assert.equal(left.queue.state, "left");
  assert.equal(left.queue.waitingCount, 0);
  assert.equal(duplicate.duplicate, true);
  assert.equal(queue.waitingPlayers().length, 0);
});

function request(type, playerId, seatToken, displayName, actionId) {
  return {
    type,
    displayName,
    actionId,
    identity: { playerId, seatToken }
  };
}
