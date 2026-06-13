import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createSpadesHostedServer } from "../server.js";
import { createSpadesHttpServer } from "../src/http-server.js";
import { createSpadesServerClient } from "../src/server-client.js";
import {
  assertHostedBetaSmokePassed,
  runHostedBetaSmokeTest
} from "../src/hosted-beta-smoke.js";
import { attachSpadesWebSocketServer } from "../src/websocket-server.js";

test("hosted server startup logs safe config and supports graceful shutdown", async () => {
  const logs = [];
  const hosted = createSpadesHostedServer({
    env: {
      PORT: "0",
      SPADES_BIND_HOST: "127.0.0.1",
      SPADES_PUBLIC_API_URL: "https://spades-beta.example.com",
      SPADES_PUBLIC_WS_URL: "wss://spades-beta.example.com/ws"
    },
    logger: {
      info(message, meta) {
        logs.push({ message, meta });
      }
    }
  });

  await hosted.start();
  await hosted.stop("test");

  assert.equal(logs[0].message, "Spades hosted prototype server listening");
  assert.equal(logs[0].meta.publicApiUrl, "https://spades-beta.example.com");
  assert.equal(JSON.stringify(logs), JSON.stringify(logs).replace(/hand|seatToken|secret/gi, ""));
  assert.equal(logs.at(-1).message, "Spades hosted prototype server stopped");
});

test("hosted health endpoint exposes deploy-safe config metadata", async () => {
  const { app } = createSpadesHttpServer({
    config: {
      publicApiUrl: "https://spades-beta.example.com",
      publicWebSocketUrl: "wss://spades-beta.example.com/ws"
    }
  });
  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const health = await (await fetch(`${baseUrl}/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.websocket, "enabled");
    assert.equal(health.publicApiUrl, "https://spades-beta.example.com");
    assert.equal(health.publicWebSocketUrl, "wss://spades-beta.example.com/ws");
    assert.doesNotMatch(JSON.stringify(health), /hand|seatToken|secret/i);
  } finally {
    await closeServer(server);
  }
});

test("hosted beta smoke flow covers health create join websocket quick match reconnect and hidden hands", async () => {
  const fixture = await startHostedSmokeFixture();

  try {
    const result = await runHostedBetaSmokeTest({
      baseUrl: fixture.baseUrl,
      fetchImpl: fetch,
      createClient: fixture.client
    });

    assert.deepEqual(result, {
      healthOk: true,
      createRoomOk: true,
      joinRoomOk: true,
      webSocketConnected: true,
      reconnectOk: true,
      quickMatchOk: true,
      hiddenHandSafe: true
    });
    assert.equal(assertHostedBetaSmokePassed(result), true);
  } finally {
    await fixture.close();
  }
});

async function startHostedSmokeFixture() {
  let websocketServer = null;
  const { app, boundary } = createSpadesHttpServer({
    onBoundaryResponse: (payload) => {
      const roomCode = payload.view?.roomCode ?? payload.spectatorView?.roomCode;
      if (roomCode) {
        websocketServer?.broadcastRoom(roomCode, {
          sourceClientId: "hosted-smoke-http",
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
          sourceClientId: "hosted-smoke-queue",
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
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
  const wsUrl = `ws://127.0.0.1:${httpServer.address().port}/ws`;
  const clients = [];

  return {
    baseUrl,
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
      for (const client of clients) client.disconnect();
      await websocketServer.close();
      await closeServer(httpServer);
    }
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
