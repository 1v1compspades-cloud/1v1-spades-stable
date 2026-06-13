import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryMatchHistory } from "../src/index.js";

test("records immutable local match summaries", () => {
  const history = createInMemoryMatchHistory({
    isComplete: (room) => room.phase === "done",
    summarize: (room, { timestamp }) => ({
      id: `${room.roomCode}-${timestamp}`,
      roomCode: room.roomCode,
      timestamp,
      winner: room.winner,
      finalScore: room.score
    })
  });

  const entry = history.record({
    roomCode: "ROOM1",
    phase: "done",
    winner: "player1",
    score: { player1: 10, player2: 0 }
  }, { timestamp: "2026-06-13T10:00:00.000Z" });

  assert.equal(entry.winner, "player1");
  assert.throws(() => {
    entry.finalScore.player1 = 0;
  }, /Cannot assign/);
  assert.deepEqual(history.list()[0].finalScore, { player1: 10, player2: 0 });
});

test("rejects incomplete match history records", () => {
  const history = createInMemoryMatchHistory({
    isComplete: (room) => room.phase === "done"
  });

  assert.throws(() => history.record({ roomCode: "ROOM1", phase: "playing" }), /completed matches/);
});
