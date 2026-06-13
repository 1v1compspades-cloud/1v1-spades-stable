import test from "node:test";
import assert from "node:assert/strict";
import {
  createSeatViewerHelpers,
  createTwoPlayerRoomLifecycle
} from "../src/index.js";

test("finds viewer seats by token or player id and sanitizes players", () => {
  const helpers = createSeatViewerHelpers();
  const room = {
    players: {
      player1: {
        seat: "player1",
        seatToken: "seat-1",
        playerId: "device-1",
        displayName: "One",
        connected: true
      },
      player2: null
    }
  };

  assert.equal(helpers.getViewerSeat(room, { seatToken: "seat-1" }), "player1");
  assert.equal(helpers.getViewerSeat(room, { playerId: "device-1" }), "player1");
  assert.equal(helpers.getViewerSeat(room, { playerId: "unknown" }), "spectator");
  assert.deepEqual(helpers.sanitizePlayers(room.players), {
    player1: { seat: "player1", displayName: "One", connected: true },
    player2: null
  });
});

test("two-player lifecycle handles create join ready leave and reset shell state", () => {
  const lifecycle = createTwoPlayerRoomLifecycle({
    generateSeatToken: () => "generated-seat",
    now: () => "2026-06-13T10:00:00.000Z"
  });
  const room = lifecycle.createRoomShell({
    roomCode: "ROOM1",
    seatToken: "seat-1",
    playerId: "device-1",
    extra: { phase: "waiting" }
  });
  const joined = lifecycle.joinRoomShell(room, {
    seatToken: "seat-2",
    playerId: "device-2",
    displayName: "Two"
  });
  const ready = lifecycle.markReady(joined.room, "player1");
  const left = lifecycle.leaveRoomShell(ready, { seatToken: "seat-1" });
  const reset = lifecycle.resetForNewMatch(left, { phase: "waiting" });

  assert.equal(joined.seat, "player2");
  assert.equal(ready.playerReady.player1, true);
  assert.equal(left.players.player1.connected, false);
  assert.deepEqual(reset.playerReady, { player1: false, player2: false });
});
