import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRoomAction,
  createRoom,
  joinRoom,
  sanitizeRoomForViewer
} from "../src/room-state.js";
import { buildRoomShellModel, renderRoomShellText } from "../src/room-shell.js";

test("builds a non-gameplay shell model from sanitized room state", () => {
  let room = createRoom({
    roomCode: "SHELL1",
    seatToken: "seat-1",
    playerId: "device-1",
    displayName: "North"
  });
  room = joinRoom(room, {
    seatToken: "seat-2",
    playerId: "device-2",
    displayName: "South"
  }).room;

  const sanitized = sanitizeRoomForViewer(room, { seatToken: "seat-1" });
  const model = buildRoomShellModel(sanitized);

  assert.equal(model.title, "Room SHELL1");
  assert.equal(model.phase, "waiting");
  assert.equal(model.viewerSeat, "player1");
  assert.equal(model.roomFull, true);
  assert.equal(model.spectator, false);
  assert.deepEqual(model.players.player1, {
    seat: "player1",
    displayName: "North",
    connected: true
  });
});

test("renders sanitized room state without card or table UI details", () => {
  let room = createRoom({
    roomCode: "SHELL2",
    seatToken: "seat-1",
    playerId: "device-1",
    displayName: "North"
  });
  room = joinRoom(room, {
    seatToken: "seat-2",
    playerId: "device-2",
    displayName: "South"
  }).room;
  room = applyRoomAction(room, { type: "ready", seatToken: "seat-1" });
  room = applyRoomAction(room, { type: "ready", seatToken: "seat-2" });

  const text = renderRoomShellText(sanitizeRoomForViewer(room, {}));

  assert.match(text, /Room SHELL2/);
  assert.match(text, /Phase: bidding/);
  assert.match(text, /Viewer: spectator/);
  assert.match(text, /Bid next: player1/);
  assert.match(text, /Can act: false/);
  assert.match(text, /Playable cards: 0/);
  assert.match(text, /Room full: true/);
  assert.match(text, /Spectator: true/);
  assert.match(text, /Hidden cards: 13-13/);
  assert.doesNotMatch(text, /clubs|diamonds|hearts|spades|A|K|Q|J/);
});
