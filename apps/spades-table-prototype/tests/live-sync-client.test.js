import test from "node:test";
import assert from "node:assert/strict";
import { createSpadesLiveSyncClient } from "../src/live-sync-client.js";
import { createMockSpadesSocketTransport } from "../src/mock-socket-transport.js";

test("live-sync client creates and joins rooms through mock socket transport", () => {
  const socketServer = createMockSpadesSocketTransport();
  const host = liveClient(socketServer, "host", "host", "seat-host");
  const guest = liveClient(socketServer, "guest", "guest", "seat-guest");
  const spectator = liveClient(socketServer, "spectator", "viewer", "seat-viewer");

  const created = host.createRoom({ roomCode: "SYNC01", displayName: "Host" });
  const joined = guest.joinRoom({ roomCode: "SYNC01", displayName: "Guest" });
  const watched = spectator.joinRoom({ roomCode: "SYNC01", displayName: "Viewer" });

  assert.equal(created.ok, true);
  assert.equal(joined.ok, true);
  assert.equal(watched.ok, true);
  assert.equal(host.session.seat, "player1");
  assert.equal(guest.session.seat, "player2");
  assert.equal(spectator.session, null);
  assert.equal(host.status.viewerSeat, "player1");
  assert.equal(guest.status.viewerSeat, "player2");
  assert.equal(spectator.status.viewerSeat, "spectator");
  assert.deepEqual(spectator.status.hand, []);
});

test("live-sync client sends ready and bid through mock transport and receives subscriptions", () => {
  const { host, guest, spectator } = readyBiddingClients("SYNC02", { readyOnly: true });
  const updates = [];
  const unsubscribe = spectator.onStatus((update) => updates.push(update));

  const hostReady = host.readyPlayer();
  const guestReady = guest.readyPlayer();

  assert.equal(hostReady.ok, true);
  assert.equal(guestReady.ok, true);
  assert.equal(host.status.phase, "bidding");
  assert.equal(guest.status.phase, "bidding");
  assert.equal(spectator.status.phase, "bidding");
  assert.equal(host.status.hand.length, 13);
  assert.equal(guest.status.hand.length, 13);
  assert.deepEqual(spectator.status.hand, []);

  const bid = host.submitBid({ bid: 4 });

  assert.equal(bid.ok, true);
  assert.match(bid.actionId, /^SYNC02:player1:bid:/);
  assert.deepEqual(host.status.bids, { player1: "locked", player2: null });
  assert.deepEqual(guest.status.bids, { player1: "locked", player2: null });
  assert.deepEqual(spectator.status.hand, []);
  assert.equal(updates.some((update) => update.view.phase === "bidding"), true);

  unsubscribe();
});

test("live-sync client plays cards through mock transport while views stay separated", () => {
  const { socketServer, host, guest, spectator } = playingClients("SYNC03");
  const leader = socketServer.repository.get("SYNC03").currentTurn;
  const leaderClient = leader === "player1" ? host : guest;
  const cardId = leaderClient.status.playableCardStatus.cardIds[0];

  const played = leaderClient.submitPlayCardById({ cardId });

  assert.equal(played.ok, true);
  assert.match(played.actionId, new RegExp(`^SYNC03:${leader}:playCard:`));
  assert.equal(host.status.viewerSeat, "player1");
  assert.equal(guest.status.viewerSeat, "player2");
  assert.equal(spectator.status.viewerSeat, "spectator");
  assert.equal(leaderClient.status.hiddenHandCounts[leader], 12);
  assert.deepEqual(spectator.status.hand, []);
  assert.equal(spectator.status.currentTrick.length, 1);
});

test("live-sync reconnect restores the current sanitized snapshot", () => {
  const { host, spectator } = readyBiddingClients("SYNC04");
  spectator.disconnect();

  const bid = host.submitBid({ bid: 4, actionId: "SYNC04:player1:bid:44" });

  assert.equal(bid.ok, true);
  assert.notDeepEqual(spectator.status.bids, { player1: "locked", player2: null });

  const reconnected = spectator.reconnect();

  assert.equal(reconnected.connected, true);
  assert.equal(spectator.status.viewerSeat, "spectator");
  assert.deepEqual(spectator.status.hand, []);
  assert.deepEqual(spectator.status.bids, { player1: "locked", player2: null });
});

test("live-sync client keeps duplicate and stale action safety from the boundary", () => {
  const { host, guest, spectator } = readyBiddingClients("SYNC05");
  const first = host.submitBid({
    bid: 5,
    actionId: "SYNC05:player1:bid:7"
  });
  const duplicate = host.submitBid({
    bid: 6,
    actionId: "SYNC05:player1:bid:7"
  });
  const guestBid = guest.submitBid({
    bid: 3,
    actionId: "SYNC05:player2:bid:1"
  });
  const stale = host.submitBid({
    bid: 4,
    actionId: "SYNC05:player1:bid:8"
  });

  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(guestBid.ok, true);
  assert.equal(stale.ok, false);
  assert.match(stale.error.message, /Stale action expected bidding phase/);
  assert.deepEqual(spectator.status.hand, []);
  assert.equal(host.status.phase, "playing");
});

function readyBiddingClients(roomCode, { readyOnly = false } = {}) {
  const socketServer = createMockSpadesSocketTransport();
  const host = liveClient(socketServer, `${roomCode}-host`, "host", "seat-host");
  const guest = liveClient(socketServer, `${roomCode}-guest`, "guest", "seat-guest");
  const spectator = liveClient(socketServer, `${roomCode}-spectator`, "viewer", "seat-viewer");

  host.createRoom({ roomCode });
  guest.joinRoom({ roomCode });
  spectator.joinRoom({ roomCode });

  if (!readyOnly) {
    host.readyPlayer();
    guest.readyPlayer();
  }

  return { socketServer, host, guest, spectator };
}

function playingClients(roomCode) {
  const setup = readyBiddingClients(roomCode);
  setup.host.submitBid({ bid: 4 });
  setup.guest.submitBid({ bid: 3 });
  return setup;
}

function liveClient(socketServer, clientId, playerId, seatToken) {
  return createSpadesLiveSyncClient({
    socketServer,
    clientId,
    playerId,
    seatToken
  });
}
