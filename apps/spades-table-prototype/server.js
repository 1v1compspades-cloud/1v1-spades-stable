import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createSpadesHttpServer } from "./src/http-server.js";
import { attachSpadesWebSocketServer } from "./src/websocket-server.js";
import { configSummary, resolveServerEnvConfig } from "./src/env-config.js";

export function createSpadesHostedServer({
  env = process.env,
  logger = console
} = {}) {
  const config = resolveServerEnvConfig(env);
  let websocketServer = null;
  const { app, boundary, repository, pushNotifier } = createSpadesHttpServer({
    config,
    onBoundaryResponse: (payload) => {
      const roomCode = payload.view?.roomCode ?? payload.spectatorView?.roomCode;
      if (roomCode) {
        websocketServer?.broadcastRoom(roomCode, safeBroadcastMeta(payload, "http"));
        const room = repository.get(roomCode);
        pushNotifier.notifyForBoundaryResponse({ payload, room, source: "http" });
      }
    },
    onQueueResponse: (payload) => {
      websocketServer?.broadcastQueue(payload);
      const roomCode = payload.match?.roomCode;
      if (roomCode) {
        websocketServer?.broadcastRoom(roomCode, safeBroadcastMeta(payload, "quick-match"));
        const room = repository.get(roomCode);
        pushNotifier.notifyForBoundaryResponse({ payload: { ...payload, type: "joinRoom" }, room, source: "quick-match" });
      }
    }
  });
  const httpServer = createServer(app);
  websocketServer = attachSpadesWebSocketServer({ httpServer, boundary, pushNotifier });

  function start() {
    return new Promise((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(config.port, config.bindHost, () => {
        httpServer.off("error", reject);
        logger.info?.("Spades hosted prototype server listening", configSummary(config));
        resolve({ config, httpServer, websocketServer, repository });
      });
    });
  }

  async function stop(signal = "manual") {
    logger.info?.("Spades hosted prototype server shutting down", { signal });
    await websocketServer.close();
    await new Promise((resolve, reject) => {
      httpServer.close((error) => error ? reject(error) : resolve());
    });
    logger.info?.("Spades hosted prototype server stopped", { signal });
  }

  return {
    config,
    app,
    boundary,
    repository,
    httpServer,
    websocketServer,
    start,
    stop
  };
}

function safeBroadcastMeta(payload, sourceClientId) {
  return {
    sourceClientId,
    requestId: payload.requestId,
    responseType: payload.type,
    actionId: payload.actionId,
    duplicate: payload.duplicate
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createSpadesHostedServer();
  let stopping = false;

  server.start().catch((error) => {
    console.error("Spades hosted prototype server failed to start", {
      message: error?.message ?? "Unknown startup error"
    });
    process.exitCode = 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      try {
        await server.stop(signal);
      } catch (error) {
        console.error("Spades hosted prototype server shutdown failed", {
          message: error?.message ?? "Unknown shutdown error"
        });
        process.exitCode = 1;
      }
    });
  }
}
