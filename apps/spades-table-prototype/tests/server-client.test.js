import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createSpadesHttpServer } from "../src/http-server.js";
import { createSpadesServerClient } from "../src/server-client.js";
import { attachSpadesWebSocketServer } from "../src/websocket-server.js";

test("server client creates and joins through HTTP and subscribes through WebSocket", async () => {
  const fixture = await startServerClientFixture();

  try {
    const host = fixture.client("host", "seat-host");
    const guest = fixture.client("guest", "seat-guest");
    const spectator = fixture.client("viewer", "seat-viewer");

    const created = await host.createRoom({ roomCode: "CLIENT1", displayName: "Host" });
    const joined = await guest.joinRoom({ roomCode: "CLIENT1", displayName: "Guest" });
    const watched = await spectator.joinRoom({ roomCode: "CLIENT1", displayName: "Viewer" });

    assert.equal(created.ok, true);
    assert.equal(joined.ok, true);
    assert.equal(watched.ok, true);
    assert.equal(host.status.viewerSeat, "player1");
    assert.equal(guest.status.viewerSeat, "player2");
    assert.equal(spectator.status.viewerSeat, "spectator");
    assert.deepEqual(spectator.status.hand, []);
    assert.equal(host.connectionStatus, "connected");
  } finally {
    await fixture.close();
  }
});

test("invite link join updates the waiting host with opponent name", async () => {
  const fixture = await startServerClientFixture();

  try {
    const host = fixture.client("host-invite", "seat-host-invite");
    const guest = fixture.client("guest-invite", "seat-guest-invite");
    const hostUpdates = [];
    host.onStatus((update) => hostUpdates.push(update));

    await host.createRoom({ roomCode: "INVITE1", displayName: "Shaw" });
    await guest.joinRoom({ roomCode: "INVITE1", displayName: "Jason" });

    assert.equal(host.status.phase, "waiting");
    assert.equal(host.status.players.player1.displayName, "Shaw");
    assert.equal(host.status.players.player2.displayName, "Jason");
    assert.equal(host.status.viewerSeat, "player1");
    assert.equal(guest.status.players.player1.displayName, "Shaw");
    assert.equal(guest.status.players.player2.displayName, "Jason");
    assert.equal(hostUpdates.some((update) => update.view?.players?.player2?.displayName === "Jason"), true);
  } finally {
    await fixture.close();
  }
});

test("server client receives sanitized broadcasts for player and spectator views", async () => {
  const fixture = await startServerClientFixture();

  try {
    const { host, guest, spectator } = await readyClients(fixture, "CLIENT2", { readyOnly: true });
    const spectatorUpdates = [];
    spectator.onStatus((update) => spectatorUpdates.push(update));

    await host.readyPlayer();
    await guest.readyPlayer();

    assert.equal(host.status.phase, "bidding");
    assert.equal(guest.status.phase, "bidding");
    assert.equal(spectator.status.phase, "bidding");
    assert.equal(host.status.hand.length, 13);
    assert.equal(guest.status.hand.length, 13);
    assert.deepEqual(spectator.status.hand, []);
    assert.equal(spectatorUpdates.some((update) => update.view.viewerSeat === "spectator"), true);
  } finally {
    await fixture.close();
  }
});

test("server client bid and play actions preserve duplicate and stale safety", async () => {
  const fixture = await startServerClientFixture();

  try {
    const { host, guest, spectator } = await readyClients(fixture, "CLIENT3");
    const first = await host.submitBid({ bid: 5, actionId: "CLIENT3:player1:bid:7" });
    const duplicate = await host.submitBid({ bid: 6, actionId: "CLIENT3:player1:bid:7" });
    const guestBid = await guest.submitBid({ bid: 3, actionId: "CLIENT3:player2:bid:1" });
    const stale = await host.submitBid({ bid: 4, actionId: "CLIENT3:player1:bid:8" });

    assert.equal(first.ok, true);
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(guestBid.ok, true);
    assert.equal(stale.ok, false);
    assert.match(stale.error.message, /Stale action expected bidding phase/);
    assert.equal(host.status.phase, "playing");
    assert.deepEqual(spectator.status.hand, []);

    const leader = fixture.repository.get("CLIENT3").currentTurn;
    const leaderClient = leader === "player1" ? host : guest;
    const cardId = leaderClient.status.playableCardStatus.cardIds[0];
    const played = await leaderClient.submitPlayCardById({
      cardId,
      actionId: `CLIENT3:${leader}:playCard:1`
    });

    assert.equal(played.ok, true);
    assert.equal(leaderClient.status.hiddenHandCounts[leader], 12);
    assert.deepEqual(spectator.status.hand, []);
    assert.equal(spectator.status.currentTrick.length, 1);
  } finally {
    await fixture.close();
  }
});

test("server client reconnect restores sanitized room snapshot", async () => {
  const fixture = await startServerClientFixture();

  try {
    const { host, spectator } = await readyClients(fixture, "CLIENT4");
    spectator.disconnect();
    await host.submitBid({ bid: 4, actionId: "CLIENT4:player1:bid:1" });

    assert.equal(spectator.connectionStatus, "disconnected");

    const reconnected = await spectator.reconnect();

    assert.equal(reconnected.connected, true);
    assert.equal(spectator.status.viewerSeat, "spectator");
    assert.deepEqual(spectator.status.hand, []);
    assert.deepEqual(spectator.status.bids, { player1: "locked", player2: null });
  } finally {
    await fixture.close();
  }
});

test("server client Quick Match pairs players and receives queue status", async () => {
  const fixture = await startServerClientFixture();

  try {
    const host = fixture.client("host", "seat-host");
    const guest = fixture.client("guest", "seat-guest");
    const spectator = fixture.client("viewer", "seat-viewer");
    const spectatorUpdates = [];
    spectator.onStatus((update) => spectatorUpdates.push(update));

    const waiting = await host.joinQuickMatch({ displayName: "Host", actionId: "qm-host" });
    const matched = await guest.joinQuickMatch({ displayName: "Guest", actionId: "qm-guest" });
    await spectator.joinRoom({ roomCode: matched.match.roomCode, displayName: "Viewer" });

    assert.equal(waiting.queue.state, "waiting");
    assert.equal(matched.queue.state, "matched");
    assert.equal(host.status.viewerSeat, "player1");
    assert.equal(guest.status.viewerSeat, "player2");
    assert.equal(spectator.status.viewerSeat, "spectator");
    assert.deepEqual(spectator.status.hand, []);
    assert.equal(host.queueStatus.state, "matched");
    assert.equal(guest.session.seat, "player2");
    assert.equal(spectatorUpdates.at(-1).view.viewerSeat, "spectator");
  } finally {
    await fixture.close();
  }
});

async function readyClients(fixture, roomCode, { readyOnly = false } = {}) {
  const host = fixture.client("host", "seat-host");
  const guest = fixture.client("guest", "seat-guest");
  const spectator = fixture.client("viewer", "seat-viewer");

  await host.createRoom({ roomCode });
  await guest.joinRoom({ roomCode });
  await spectator.joinRoom({ roomCode });

  if (!readyOnly) {
    await host.readyPlayer();
    await guest.readyPlayer();
  }

  return { host, guest, spectator };
}

async function startServerClientFixture() {
  let websocketServer = null;
  const { app, boundary, repository } = createSpadesHttpServer({
    onBoundaryResponse: (payload) => {
      const roomCode = payload.view?.roomCode ?? payload.spectatorView?.roomCode;
      if (roomCode) {
        websocketServer?.broadcastRoom(roomCode, {
          sourceClientId: "http-test",
          requestId: payload.requestId,
          responseType: payload.type,
          actionId: payload.actionId,
          duplicate: payload.duplicate
        });
      }
    },
    onQueueResponse: (payload) => {
      websocketServer?.broadcastQueue(payload);
      if (payload.match?.roomCode) {
        websocketServer?.broadcastRoom(payload.match.roomCode, {
          sourceClientId: "quick-match-test",
          requestId: payload.requestId,
          responseType: payload.type,
          actionId: payload.actionId,
          duplicate: payload.duplicate
        });
      }
    }
  });
  const httpServer = createServer(app);
  websocketServer = attachSpadesWebSocketServer({ httpServer, boundary });
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  const wsUrl = `ws://127.0.0.1:${httpServer.address().port}/ws`;
  const clients = [];

  return {
    repository,
    client(playerId, seatToken) {
      const client = createSpadesServerClient({
        baseUrl,
        wsUrl,
        fetchImpl: fetch,
        WebSocketImpl: WebSocket,
        playerId,
        seatToken
      });
      clients.push(client);
      return client;
    },
    async close() {
      for (const client of clients) {
        client.disconnect();
      }
      await websocketServer.close();
      await new Promise((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}
