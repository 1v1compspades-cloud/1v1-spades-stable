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

test("renders text-only hand, playable, current trick, and last trick summaries", () => {
  let room = createRoom({
    roomCode: "SHELL3",
    seatToken: "seat-1",
    playerId: "device-1",
    displayName: "North",
    coinFlipWinner: "player2",
    deck: player2HighDeck()
  });
  room = joinRoom(room, {
    seatToken: "seat-2",
    playerId: "device-2",
    displayName: "South"
  }).room;
  room = applyRoomAction(room, { type: "ready", seatToken: "seat-1" });
  room = applyRoomAction(room, { type: "ready", seatToken: "seat-2" });
  room = applyRoomAction(room, { type: "bid", seatToken: "seat-1", bid: 4 });
  room = applyRoomAction(room, { type: "bid", seatToken: "seat-2", bid: 3 });
  room = applyRoomAction(room, {
    type: "playCard",
    seatToken: "seat-1",
    card: { rank: "2", suit: "clubs" }
  });

  const currentText = renderRoomShellText(sanitizeRoomForViewer(room, { seatToken: "seat-1" }));

  assert.match(currentText, /Hand IDs:/);
  assert.match(currentText, /Playable IDs:/);
  assert.match(currentText, /Current trick: player1:2-clubs/);

  room = applyRoomAction(room, {
    type: "playCard",
    seatToken: "seat-2",
    card: { rank: "A", suit: "clubs" }
  });

  const lastText = renderRoomShellText(sanitizeRoomForViewer(room, { seatToken: "seat-1" }));

  assert.match(lastText, /Last trick: player1:2-clubs, player2:A-clubs/);
  assert.match(lastText, /Trick winner: player2/);
});

function player2HighDeck() {
  return orderedDeck({
    player1Cards: [
      ...cards("clubs", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]),
      { rank: "2", suit: "hearts" }
    ],
    player2Cards: [
      { rank: "A", suit: "clubs" },
      ...cards("diamonds", ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"])
    ]
  });
}

function cards(suit, ranks) {
  return ranks.map((rank) => ({ rank, suit }));
}

function orderedDeck({ player1Cards, player2Cards }) {
  const used = new Set([...player1Cards, ...player2Cards].map((card) => `${card.rank}-${card.suit}`));
  const stock = ["clubs", "diamonds", "hearts", "spades"].flatMap((suit) => (
    ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
      .map((rank) => ({ rank, suit }))
      .filter((card) => !used.has(`${card.rank}-${card.suit}`))
  ));

  return [...player1Cards, ...player2Cards, ...stock];
}
