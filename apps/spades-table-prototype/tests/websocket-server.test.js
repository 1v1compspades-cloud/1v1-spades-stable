import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createSpadesHttpServer } from "../src/http-server.js";
import { attachSpadesWebSocketServer } from "../src/websocket-server.js";

test("WebSocket server connects, subscribes, and broadcasts sanitized room views", async () => {
  const fixture = await startWebSocketFixture();

  try {
    const host = await fixture.client("host", hostIdentity());
    const guest = await fixture.client("guest", guestIdentity());
    const spectator = await fixture.client("spectator", spectatorIdentity());

    await host.action({ type: "createRoom", roomCode: "WS01", requestId: "create-ws" });
    await guest.action({ type: "joinRoom", roomCode: "WS01", requestId: "join-ws" });
    await spectator.action({ type: "joinRoom", roomCode: "WS01", requestId: "watch-ws" });
    await host.subscribe("WS01");
    await guest.subscribe("WS01");
    await spectator.subscribe("WS01");
    host.clear();
    guest.clear();
    spectator.clear();

    await host.action({ type: "ready", roomCode: "WS01", actionId: "WS01:player1:ready:1" });
    await guest.action({ type: "ready", roomCode: "WS01", actionId: "WS01:player2:ready:1" });
    await Promise.all([
      host.waitRoomEvent((event) => event.actionId === "WS01:player2:ready:1"),
      guest.waitRoomEvent((event) => event.actionId === "WS01:player2:ready:1"),
      spectator.waitRoomEvent((event) => event.actionId === "WS01:player2:ready:1")
    ]);

    const hostUpdate = host.lastRoomEvent();
    const guestUpdate = guest.lastRoomEvent();
    const spectatorUpdate = spectator.lastRoomEvent();

    assert.equal(hostUpdate.view.viewerSeat, "player1");
    assert.equal(guestUpdate.view.viewerSeat, "player2");
    assert.equal(spectatorUpdate.view.viewerSeat, "spectator");
    assert.equal(hostUpdate.view.phase, "bidding");
    assert.equal(hostUpdate.view.hand.length, 13);
    assert.equal(guestUpdate.view.hand.length, 13);
    assert.deepEqual(spectatorUpdate.view.hand, []);
    assert.deepEqual(spectatorUpdate.view.hiddenHandCounts, { player1: 13, player2: 13 });
  } finally {
    await fixture.close();
  }
});

test("WebSocket action response then broadcast preserves action id and duplicate safety", async () => {
  const fixture = await startWebSocketFixture();

  try {
    const { host, guest, spectator } = await readyBiddingSockets(fixture, "WS02");
    host.clear();
    guest.clear();
    spectator.clear();

    const first = await host.action({
      type: "bid",
      roomCode: "WS02",
      bid: 5,
      actionId: "WS02:player1:bid:7"
    });
    const duplicate = await host.action({
      type: "bid",
      roomCode: "WS02",
      bid: 6,
      actionId: "WS02:player1:bid:7"
    });
    await Promise.all([
      host.waitRoomEvent((event) => event.duplicate === true),
      guest.waitRoomEvent((event) => event.duplicate === true),
      spectator.waitRoomEvent((event) => event.duplicate === true)
    ]);

    assert.equal(first.ok, true);
    assert.equal(first.actionId, "WS02:player1:bid:7");
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.actionId, "WS02:player1:bid:7");
    assert.equal(host.lastRoomEvent().duplicate, true);
    assert.equal(guest.lastRoomEvent().duplicate, true);
    assert.deepEqual(spectator.lastRoomEvent().view.hand, []);
    assert.deepEqual(host.lastRoomEvent().view.bids, { player1: "locked", player2: null });
  } finally {
    await fixture.close();
  }
});

test("WebSocket stale actions return failure without room broadcast", async () => {
  const fixture = await startWebSocketFixture();

  try {
    const { host, guest, spectator } = await readyBiddingSockets(fixture, "WS03");
    await host.action({ type: "bid", roomCode: "WS03", bid: 4, actionId: "WS03:player1:bid:1" });
    await guest.action({ type: "bid", roomCode: "WS03", bid: 3, actionId: "WS03:player2:bid:1" });
    await Promise.all([
      host.waitRoomEvent((event) => event.actionId === "WS03:player2:bid:1"),
      guest.waitRoomEvent((event) => event.actionId === "WS03:player2:bid:1"),
      spectator.waitRoomEvent((event) => event.actionId === "WS03:player2:bid:1")
    ]);
    host.clear();
    guest.clear();
    spectator.clear();

    const stale = await host.action({
      type: "bid",
      roomCode: "WS03",
      bid: 2,
      actionId: "WS03:player1:bid:2"
    });

    assert.equal(stale.ok, false);
    assert.match(stale.error.message, /Stale action expected bidding phase/);
    assert.equal(host.messages.filter((message) => message.type === "roomUpdate").length, 0);
    assert.equal(guest.messages.length, 0);
    assert.equal(spectator.messages.length, 0);
  } finally {
    await fixture.close();
  }
});

test("WebSocket disconnect suppresses broadcasts and reconnect snapshot restores safe view", async () => {
  const fixture = await startWebSocketFixture();

  try {
    const { host, spectator } = await readyBiddingSockets(fixture, "WS04");
    await spectator.waitRoomEvent((event) => event.actionId === "WS04:player2:ready:1");
    spectator.clear();
    spectator.close();
    await spectator.closed;

    await host.action({ type: "bid", roomCode: "WS04", bid: 4, actionId: "WS04:player1:bid:1" });
    assert.equal(spectator.messages.length, 0);

    const reconnected = await fixture.client("spectator-reconnect", spectatorIdentity());
    await reconnected.subscribe("WS04");
    const snapshot = reconnected.lastRoomEvent();

    assert.equal(snapshot.type, "roomSnapshot");
    assert.equal(snapshot.view.viewerSeat, "spectator");
    assert.deepEqual(snapshot.view.hand, []);
    assert.deepEqual(snapshot.view.bids, { player1: "locked", player2: null });
  } finally {
    await fixture.close();
  }
});

test("WebSocket play-card broadcasts player and spectator safe channels", async () => {
  const fixture = await startWebSocketFixture();

  try {
    const { host, guest, spectator } = await playingSockets(fixture, "WS05");
    const leader = fixture.repository.get("WS05").currentTurn;
    const leaderClient = leader === "player1" ? host : guest;
    const cardId = leaderClient.lastRoomEvent().view.playableCardStatus.cardIds[0];
    host.clear();
    guest.clear();
    spectator.clear();

    const played = await leaderClient.action({
      type: "playCard",
      roomCode: "WS05",
      cardId,
      actionId: `WS05:${leader}:playCard:1`
    });
    await Promise.all([
      host.waitRoomEvent((event) => event.actionId === `WS05:${leader}:playCard:1`),
      guest.waitRoomEvent((event) => event.actionId === `WS05:${leader}:playCard:1`),
      spectator.waitRoomEvent((event) => event.actionId === `WS05:${leader}:playCard:1`)
    ]);

    assert.equal(played.ok, true);
    assert.equal(host.lastRoomEvent().view.viewerSeat, "player1");
    assert.equal(guest.lastRoomEvent().view.viewerSeat, "player2");
    assert.equal(spectator.lastRoomEvent().view.viewerSeat, "spectator");
    assert.deepEqual(spectator.lastRoomEvent().view.hand, []);
    assert.equal(leaderClient.lastRoomEvent().view.hiddenHandCounts[leader], 12);
  } finally {
    await fixture.close();
  }
});

async function readyBiddingSockets(fixture, roomCode) {
  const host = await fixture.client(`${roomCode}-host`, hostIdentity());
  const guest = await fixture.client(`${roomCode}-guest`, guestIdentity());
  const spectator = await fixture.client(`${roomCode}-spectator`, spectatorIdentity());

  await host.action({ type: "createRoom", roomCode });
  await guest.action({ type: "joinRoom", roomCode });
  await spectator.action({ type: "joinRoom", roomCode });
  await host.subscribe(roomCode);
  await guest.subscribe(roomCode);
  await spectator.subscribe(roomCode);
  await host.action({ type: "ready", roomCode, actionId: `${roomCode}:player1:ready:1` });
  await guest.action({ type: "ready", roomCode, actionId: `${roomCode}:player2:ready:1` });

  return { host, guest, spectator };
}

async function playingSockets(fixture, roomCode) {
  const setup = await readyBiddingSockets(fixture, roomCode);
  await setup.host.action({ type: "bid", roomCode, bid: 4, actionId: `${roomCode}:player1:bid:1` });
  await setup.guest.action({ type: "bid", roomCode, bid: 3, actionId: `${roomCode}:player2:bid:1` });
  return setup;
}

async function startWebSocketFixture() {
  const { app, boundary, repository } = createSpadesHttpServer();
  const httpServer = createServer(app);
  const socketServer = attachSpadesWebSocketServer({ httpServer, boundary });
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const wsUrl = `ws://127.0.0.1:${httpServer.address().port}/ws`;
  const clients = [];

  return {
    repository,
    async client(name, identity) {
      const client = await createTestClient(wsUrl, name, identity);
      clients.push(client);
      return client;
    },
    async close() {
      for (const client of clients) {
        client.close();
      }
      await socketServer.close();
      await new Promise((resolve, reject) => {
        httpServer.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}

function createTestClient(wsUrl, name, identity) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const messages = [];
    const waiters = [];
    let closedResolve;
    const closed = new Promise((closedDone) => {
      closedResolve = closedDone;
    });

    const client = {
      name,
      socket,
      messages,
      closed,
      send(message) {
        socket.send(JSON.stringify(message));
      },
      async identify(nextIdentity = identity) {
        const nextMessage = waitForType("identified", messages.length);
        this.send({ type: "identify", identity: nextIdentity });
        return nextMessage;
      },
      async subscribe(roomCode, nextIdentity = identity) {
        const nextMessage = waitForRoomEvent(messages.length);
        this.send({ type: "subscribe", roomCode, identity: nextIdentity });
        return nextMessage;
      },
      async action(request) {
        const nextMessage = waitForType("actionResponse", messages.length);
        this.send({ type: "action", request });
        return nextMessage;
      },
      waitRoomEvent(predicate = () => true) {
        return waitFor((message) => (
          ["roomUpdate", "roomSnapshot"].includes(message.type) && predicate(message)
        ), 0);
      },
      close() {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      },
      clear() {
        messages.length = 0;
      },
      lastRoomEvent() {
        return messages.filter((message) => ["roomUpdate", "roomSnapshot"].includes(message.type)).at(-1);
      }
    };

    socket.on("message", (rawMessage) => {
      const message = JSON.parse(String(rawMessage));
      messages.push(message);
      for (let index = 0; index < waiters.length; index += 1) {
        const waiter = waiters[index];
        if (waiter.predicate(message)) {
          waiters.splice(index, 1);
          waiter.resolve(message);
          return;
        }
      }
    });
    socket.on("error", reject);
    socket.on("close", () => closedResolve());
    socket.on("open", async () => {
      try {
        await waitForType("connected", 0);
        await client.identify(identity);
        resolve(client);
      } catch (error) {
        reject(error);
      }
    });

    function waitForType(type, fromIndex = messages.length) {
      return waitFor((message) => message.type === type, fromIndex);
    }

    function waitForRoomEvent(fromIndex = messages.length) {
      return waitFor((message) => ["roomUpdate", "roomSnapshot"].includes(message.type), fromIndex);
    }

    function waitFor(predicate, fromIndex = messages.length) {
      const existing = messages.slice(fromIndex).find(predicate);
      if (existing) return Promise.resolve(existing);

      return new Promise((resolveWaiter) => {
        waiters.push({
          predicate,
          resolve: resolveWaiter
        });
      });
    }
  });
}

function hostIdentity() {
  return { playerId: "host", seatToken: "seat-host" };
}

function guestIdentity() {
  return { playerId: "guest", seatToken: "seat-guest" };
}

function spectatorIdentity() {
  return { playerId: "viewer", seatToken: "seat-viewer" };
}
