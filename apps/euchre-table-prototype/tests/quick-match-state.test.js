import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelQuickMatchQueue,
  enterQuickMatchQueue
} from "../src/quick-match-state.js";

test("first player enters quick match queue and waits", () => {
  const queue = new Map();
  const result = enterQueue(queue, { playerId: "p1", displayName: "Alice" });

  assert.equal(result.matched, false);
  assert.equal(result.entry.status, "waiting");
  assert.equal(result.entry.displayName, "Alice");
  assert.equal(queue.size, 1);
});

test("second compatible player matches and creates room", () => {
  const queue = new Map();
  enterQueue(queue, { playerId: "p1", displayName: "Alice" });
  const result = enterQueue(queue, { playerId: "p2", displayName: "Bob" });

  assert.equal(result.matched, true);
  assert.equal(result.entry.status, "matched");
  assert.equal(result.entry.matchedRoomCode, "MATCH1");
  assert.equal([...queue.values()].every((entry) => entry.status === "matched"), true);
});

test("same playerId cannot match itself and returns existing waiting entry", () => {
  const queue = new Map();
  const first = enterQueue(queue, { playerId: "same-player", displayName: "Alice" });
  const second = enterQueue(queue, { playerId: "same-player", displayName: "Alice Again" });

  assert.equal(second.matched, false);
  assert.equal(second.entry.queueId, first.entry.queueId);
  assert.equal(queue.size, 1);
});

test("same accountId cannot match itself", () => {
  const queue = new Map();
  const first = enterQueue(queue, { playerId: "p1", accountId: "acct1", displayName: "Alice" });
  const second = enterQueue(queue, { playerId: "p2", accountId: "acct1", displayName: "Alice Device 2" });

  assert.equal(second.matched, false);
  assert.equal(second.entry.queueId, first.entry.queueId);
  assert.equal(queue.size, 1);
});

test("raceTo 5 only matches raceTo 5 and raceTo 10 only matches raceTo 10", () => {
  const queue = new Map();
  enterQueue(queue, { playerId: "p1", displayName: "Five", raceTo: 5 });
  const ten = enterQueue(queue, { playerId: "p2", displayName: "Ten", raceTo: 10 });
  assert.equal(ten.matched, false);
  assert.equal(queue.size, 2);

  const five = enterQueue(queue, { playerId: "p3", displayName: "Five Two", raceTo: 5 });
  assert.equal(five.matched, true);
  assert.equal(five.entry.matchedRoomCode, "MATCH1");

  const tenTwo = enterQueue(queue, { playerId: "p4", displayName: "Ten Two", raceTo: 10 });
  assert.equal(tenTwo.matched, true);
  assert.equal(tenTwo.entry.matchedRoomCode, "MATCH2");
});

test("cancel queue marks waiting entry cancelled", () => {
  const queue = new Map();
  const now = Date.parse("2026-06-10T12:00:00.000Z");
  const first = enterQueue(queue, { playerId: "p1", displayName: "Alice", now });
  const cancelled = cancelQuickMatchQueue(queue, {
    queueId: first.entry.queueId,
    playerId: "p1",
    now
  });

  assert.equal(cancelled.status, "cancelled");
});

test("expired entries are ignored", () => {
  const queue = new Map();
  const now = Date.parse("2026-06-10T12:00:00.000Z");
  enterQueue(queue, { playerId: "old", displayName: "Old", now });
  const result = enterQueue(queue, {
    playerId: "new",
    displayName: "New",
    now: now + 5 * 60 * 1000 + 1
  });

  assert.equal(result.matched, false);
  assert.equal([...queue.values()].find((entry) => entry.playerId === "old").status, "expired");
  assert.equal([...queue.values()].find((entry) => entry.playerId === "new").status, "waiting");
});

test("refresh re-enter queue returns existing matched entry", () => {
  const queue = new Map();
  enterQueue(queue, { playerId: "p1", displayName: "Alice" });
  const matched = enterQueue(queue, { playerId: "p2", displayName: "Bob" });
  const refreshed = enterQueue(queue, { playerId: "p1", displayName: "Alice" });

  assert.equal(matched.matched, true);
  assert.equal(refreshed.matched, true);
  assert.equal(refreshed.entry.matchedRoomCode, "MATCH1");
});

function enterQueue(queue, { playerId, accountId, displayName, raceTo = 5, now = Date.parse("2026-06-10T12:00:00.000Z") }) {
  let roomCounter = queue.__roomCounter ?? 0;
  return enterQuickMatchQueue(queue, {
    playerId,
    accountId,
    displayName,
    matchSettings: {
      modeId: "communityCompetitive",
      raceTo,
      stickTheDealer: true
    },
    now,
    createMatchRoom: () => {
      roomCounter += 1;
      queue.__roomCounter = roomCounter;
      return { roomCode: `MATCH${roomCounter}` };
    }
  });
}
