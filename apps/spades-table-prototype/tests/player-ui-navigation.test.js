import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerNavigationVisibility,
  cleanHomeRoomCodeForStatus,
  isCleanHomeMode
} from "../src/player-ui-navigation.js";

test("clean Home preserves the active room but hides room UI until reconnect", () => {
  const status = roomStatus({ roomCode: "HOME01", phase: "waiting" });

  const inRoom = buildPlayerNavigationVisibility({
    status,
    activePlayerScreen: "play",
    cleanHomeRoomCode: null
  });
  assert.equal(inRoom.cleanHome, false);
  assert.equal(inRoom.bodyHasRoom, true);
  assert.equal(inRoom.showUniversalHome, true);
  assert.equal(inRoom.showGlobalRoomInvite, true);
  assert.equal(inRoom.showReconnect, false);

  const cleanHomeRoomCode = cleanHomeRoomCodeForStatus(status);
  const cleanHome = buildPlayerNavigationVisibility({
    status,
    activePlayerScreen: "lobby",
    cleanHomeRoomCode
  });
  assert.equal(cleanHome.cleanHome, true);
  assert.equal(cleanHome.bodyHasRoom, false);
  assert.equal(cleanHome.showUniversalHome, false);
  assert.equal(cleanHome.showGlobalRoomInvite, false);
  assert.equal(cleanHome.showRoomInvite, false);
  assert.equal(cleanHome.showReconnect, true);
});

test("clean Home works for active gameplay phases, not only waiting rooms", () => {
  const status = roomStatus({ roomCode: "PLAY01", phase: "playing" });
  const visibility = buildPlayerNavigationVisibility({
    status,
    activePlayerScreen: "lobby",
    cleanHomeRoomCode: "PLAY01"
  });

  assert.equal(visibility.cleanHome, true);
  assert.equal(visibility.bodyHasRoom, false);
  assert.equal(visibility.showReconnect, true);
  assert.equal(visibility.showRoomInvite, false);
});

test("clean Home clears when the active room changes or disappears", () => {
  assert.equal(isCleanHomeMode({
    activePlayerScreen: "lobby",
    cleanHomeRoomCode: "OLD01",
    status: roomStatus({ roomCode: "NEW01", phase: "waiting" })
  }), false);

  assert.equal(isCleanHomeMode({
    activePlayerScreen: "lobby",
    cleanHomeRoomCode: "OLD01",
    status: null
  }), false);
});

test("Reconnect can be shown from a saved local session when no live room is loaded", () => {
  const visibility = buildPlayerNavigationVisibility({
    status: null,
    activePlayerScreen: "lobby",
    cleanHomeRoomCode: null,
    hasSavedRoom: true
  });

  assert.equal(visibility.cleanHome, false);
  assert.equal(visibility.bodyHasRoom, false);
  assert.equal(visibility.showUniversalHome, false);
  assert.equal(visibility.showReconnect, true);
});

function roomStatus({ roomCode, phase }) {
  return {
    roomCode,
    phase,
    viewerSeat: "player1",
    players: {
      player1: { displayName: "Host" },
      player2: null
    }
  };
}
