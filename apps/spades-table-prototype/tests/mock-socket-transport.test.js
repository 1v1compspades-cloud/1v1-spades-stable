import test from "node:test";
import assert from "node:assert/strict";
import { createMockSpadesSocketTransport } from "../src/mock-socket-transport.js";

test("mock socket broadcasts sanitized room updates to player and spectator subscriptions", () => {
  const socketServer = createMockSpadesSocketTransport();
  const host = socketServer.connect({ clientId: "host", playerId: "host", seatToken: "seat-host" });
  const guest = socketServer.connect({ clientId: "guest", playerId: "guest", seatToken: "seat-guest" });
  const spectator = socketServer.connect({ clientId: "spectator", playerId: "viewer", seatToken: "seat-viewer" });

  host.send(request("createRoom", { roomCode: "LIVE01", requestId: "create-1" }));
  guest.send(request("joinRoom", { roomCode: "LIVE01", requestId: "join-1" }));
  spectator.send(request("joinRoom", { roomCode: "LIVE01", requestId: "spectate-1" }));
  host.subscribe("LIVE01");
  guest.subscribe("LIVE01");
  spectator.subscribe("LIVE01");

  host.clearMessages();
  guest.clearMessages();
  spectator.clearMessages();

  host.send(request("ready", {
    roomCode: "LIVE01",
    actionId: "LIVE01:player1:ready:1",
    requestId: "ready-host"
  }));
  guest.send(request("ready", {
    roomCode: "LIVE01",
    actionId: "LIVE01:player2:ready:1",
    requestId: "ready-guest"
  }));

  const hostUpdate = lastRoomUpdate(host);
  const guestUpdate = lastRoomUpdate(guest);
  const spectatorUpdate = lastRoomUpdate(spectator);

  assert.equal(hostUpdate.view.viewerSeat, "player1");
  assert.equal(guestUpdate.view.viewerSeat, "player2");
  assert.equal(spectatorUpdate.view.viewerSeat, "spectator");
  assert.equal(hostUpdate.view.phase, "bidding");
  assert.equal(hostUpdate.view.hand.length, 13);
  assert.equal(guestUpdate.view.hand.length, 13);
  assert.deepEqual(spectatorUpdate.view.hand, []);
  assert.deepEqual(spectatorUpdate.view.hiddenHandCounts, { player1: 13, player2: 13 });
  assert.equal(hostUpdate.actionId, "LIVE01:player2:ready:1");
});

test("socket action request flows through boundary response then broadcast", () => {
  const { host, guest, spectator } = readyBiddingSockets("LIVE02");
  host.clearMessages();
  guest.clearMessages();
  spectator.clearMessages();

  const response = host.send(request("bid", {
    roomCode: "LIVE02",
    bid: 4,
    actionId: "LIVE02:player1:bid:1",
    requestId: "bid-host"
  }));

  const actionResponse = host.messages().find((message) => message.type === "actionResponse");
  const hostUpdate = lastRoomUpdate(host);
  const guestUpdate = lastRoomUpdate(guest);
  const spectatorUpdate = lastRoomUpdate(spectator);

  assert.equal(response.ok, true);
  assert.equal(actionResponse.ok, true);
  assert.equal(actionResponse.actionId, "LIVE02:player1:bid:1");
  assert.equal(hostUpdate.responseType, "bid");
  assert.equal(hostUpdate.actionId, "LIVE02:player1:bid:1");
  assert.deepEqual(hostUpdate.view.bids, { player1: "locked", player2: null });
  assert.deepEqual(guestUpdate.view.bids, { player1: "locked", player2: null });
  assert.deepEqual(spectatorUpdate.view.hand, []);
});

test("mock socket disconnect suppresses broadcasts and reconnect emits fresh sanitized snapshot", () => {
  const { host, guest, spectator } = readyBiddingSockets("LIVE03");
  spectator.clearMessages();
  spectator.disconnect();

  host.send(request("bid", {
    roomCode: "LIVE03",
    bid: 4,
    actionId: "LIVE03:player1:bid:1"
  }));

  assert.equal(spectator.messages().length, 0);

  spectator.reconnect();
  const snapshot = spectator.messages().at(-1);

  assert.equal(snapshot.type, "roomSnapshot");
  assert.equal(snapshot.view.viewerSeat, "spectator");
  assert.deepEqual(snapshot.view.hand, []);
  assert.deepEqual(snapshot.view.bids, { player1: "locked", player2: null });
});

test("duplicate socket actions remain idempotent and broadcast duplicate metadata", () => {
  const { host, guest } = readyBiddingSockets("LIVE04");
  const first = host.send(request("bid", {
    roomCode: "LIVE04",
    bid: 5,
    actionId: "LIVE04:player1:bid:7"
  }));
  host.clearMessages();
  guest.clearMessages();

  const duplicate = host.send(request("bid", {
    roomCode: "LIVE04",
    bid: 6,
    actionId: "LIVE04:player1:bid:7"
  }));
  const hostUpdate = lastRoomUpdate(host);
  const guestUpdate = lastRoomUpdate(guest);

  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(hostUpdate.duplicate, true);
  assert.equal(guestUpdate.duplicate, true);
  assert.deepEqual(hostUpdate.view.bids, { player1: "locked", player2: null });
  assert.equal(hostUpdate.view.appliedActionCount, first.view.appliedActionCount);
});

test("stale socket action returns failure without broadcasting a room update", () => {
  const { host, guest, spectator } = readyBiddingSockets("LIVE05");
  host.send(request("bid", {
    roomCode: "LIVE05",
    bid: 4,
    actionId: "LIVE05:player1:bid:1"
  }));
  guest.send(request("bid", {
    roomCode: "LIVE05",
    bid: 3,
    actionId: "LIVE05:player2:bid:1"
  }));
  host.clearMessages();
  guest.clearMessages();
  spectator.clearMessages();

  const stale = host.send(request("bid", {
    roomCode: "LIVE05",
    bid: 2,
    actionId: "LIVE05:player1:bid:2"
  }));

  assert.equal(stale.ok, false);
  assert.match(stale.error.message, /Stale action expected bidding phase/);
  assert.equal(host.messages().filter((message) => message.type === "roomUpdate").length, 0);
  assert.equal(guest.messages().length, 0);
  assert.equal(spectator.messages().length, 0);
  assert.equal(host.messages().at(-1).type, "actionResponse");
});

test("socket play-card broadcasts per-seat sanitized live views", () => {
  const { socketServer, host, guest, spectator } = playingSockets("LIVE06");
  const leader = socketServer.repository.get("LIVE06").currentTurn;
  const leaderSocket = leader === "player1" ? host : guest;
  const card = socketServer.repository.get("LIVE06").game.hands[leader][0];
  host.clearMessages();
  guest.clearMessages();
  spectator.clearMessages();

  const played = leaderSocket.send(request("playCard", {
    roomCode: "LIVE06",
    cardId: `${card.rank}-${card.suit}`,
    actionId: `LIVE06:${leader}:playCard:1`
  }));

  assert.equal(played.ok, true);
  assert.equal(lastRoomUpdate(host).view.viewerSeat, "player1");
  assert.equal(lastRoomUpdate(guest).view.viewerSeat, "player2");
  assert.equal(lastRoomUpdate(spectator).view.viewerSeat, "spectator");
  assert.deepEqual(lastRoomUpdate(spectator).view.hand, []);
  assert.equal(lastRoomUpdate(leaderSocket).view.hiddenHandCounts[leader], 12);
});

function readyBiddingSockets(roomCode) {
  const socketServer = createMockSpadesSocketTransport();
  const host = socketServer.connect({ clientId: `${roomCode}-host`, playerId: "host", seatToken: "seat-host" });
  const guest = socketServer.connect({ clientId: `${roomCode}-guest`, playerId: "guest", seatToken: "seat-guest" });
  const spectator = socketServer.connect({ clientId: `${roomCode}-spectator`, playerId: "viewer", seatToken: "seat-viewer" });

  host.send(request("createRoom", { roomCode }));
  guest.send(request("joinRoom", { roomCode }));
  spectator.send(request("joinRoom", { roomCode }));
  host.subscribe(roomCode);
  guest.subscribe(roomCode);
  spectator.subscribe(roomCode);
  host.send(request("ready", { roomCode, actionId: `${roomCode}:player1:ready:1` }));
  guest.send(request("ready", { roomCode, actionId: `${roomCode}:player2:ready:1` }));

  return { socketServer, host, guest, spectator };
}

function playingSockets(roomCode) {
  const setup = readyBiddingSockets(roomCode);
  setup.host.send(request("bid", { roomCode, bid: 4, actionId: `${roomCode}:player1:bid:1` }));
  setup.guest.send(request("bid", { roomCode, bid: 3, actionId: `${roomCode}:player2:bid:1` }));
  return setup;
}

function request(type, fields = {}) {
  return {
    requestId: fields.requestId ?? `${type}-${fields.actionId ?? fields.roomCode ?? "request"}`,
    type,
    ...fields
  };
}

function lastRoomUpdate(socket) {
  const updates = socket.messages().filter((message) => message.type === "roomUpdate" || message.type === "roomSnapshot");
  return updates.at(-1);
}
