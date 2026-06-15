import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuickMatchQueue } from "./quick-match.js";
import { createSpadesServerBoundary } from "./server-boundary.js";
import { createSpadesPushNotifier } from "./push-notifications.js";
import { createShuffledDeck } from "../../../packages/spades-core/src/deck.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(sourceDir, "..");
const repoDir = resolve(appDir, "../..");
const indexPath = resolve(appDir, "index.html");

export function createSpadesHttpServer({
  boundary = createSpadesServerBoundary(),
  onBoundaryResponse = null,
  quickMatchQueue = createQuickMatchQueue({ boundary }),
  onQueueResponse = null,
  config = null,
  pushNotifier = createSpadesPushNotifier()
} = {}) {
  const app = express();
  app.use(express.json({ limit: "128kb" }));

  app.get("/health", (request, response) => {
    const publicConfig = publicHealthConfig(config, request);
    response.json({
      ok: true,
      service: "spades-table-prototype",
      transport: "http-local",
      websocket: "enabled",
      publicApiUrl: publicConfig.publicApiUrl,
      publicWebSocketUrl: publicConfig.publicWebSocketUrl
    });
  });

  app.post("/api/rooms", (request, response) => {
    sendBoundaryResponse(response, boundary.handle({
      ...request.body,
      deck: request.body?.deck ?? createShuffledDeck(),
      type: "createRoom"
    }), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/join", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "joinRoom")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/ready", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "ready")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/bid", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "bid")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/play-card", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "playCard")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/leave", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "leaveRoom")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/next-hand", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "nextHand")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/new-match", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "newMatch")), onBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/rematch", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "rematch")), onBoundaryResponse);
  });

  app.post("/api/push/register", (request, response) => {
    const result = pushNotifier.registerToken(request.body ?? {});
    response.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/quick-match/join", (request, response) => {
    sendQueueResponse(response, safeQueueAction(() => quickMatchQueue.joinQueue({
      ...request.body,
      type: "joinQueue"
    })), onQueueResponse);
  });

  app.post("/api/quick-match/leave", (request, response) => {
    sendQueueResponse(response, safeQueueAction(() => quickMatchQueue.leaveQueue({
      ...request.body,
      type: "leaveQueue"
    })), onQueueResponse);
  });

  app.get("/", (_request, response) => {
    response.sendFile(indexPath);
  });

  app.use("/src", express.static(sourceDir, {
    index: false,
    fallthrough: true
  }));
  app.use("/packages/spades-core/src", express.static(resolve(repoDir, "packages/spades-core/src"), {
    index: false,
    fallthrough: true
  }));
  app.use("/packages/game-shell-core/src", express.static(resolve(repoDir, "packages/game-shell-core/src"), {
    index: false,
    fallthrough: true
  }));

  app.use((_request, response) => {
    response.status(404).json({
      ok: false,
      error: {
        message: "Spades HTTP route not found"
      }
    });
  });

  return {
    app,
    boundary,
    quickMatchQueue,
    pushNotifier,
    repository: boundary.repository
  };
}

function publicHealthConfig(config, request) {
  const requestOrigin = publicOriginFromRequest(request);
  const publicApiUrl = shouldUseRequestOrigin(config?.publicApiUrl) && requestOrigin
    ? requestOrigin
    : config?.publicApiUrl ?? requestOrigin ?? null;
  const publicWebSocketUrl = shouldUseRequestOrigin(config?.publicWebSocketUrl) && requestOrigin
    ? publicOriginToWebSocketUrl(requestOrigin)
    : config?.publicWebSocketUrl ?? (requestOrigin ? publicOriginToWebSocketUrl(requestOrigin) : null);

  return { publicApiUrl, publicWebSocketUrl };
}

function publicOriginFromRequest(request) {
  const forwardedHost = firstForwardedHeader(request.get("x-forwarded-host"));
  const host = forwardedHost ?? request.get("host");
  if (!host) return null;
  const hostname = host.split(":")[0];
  if (isLocalHostname(hostname)) return null;
  const forwardedProto = firstForwardedHeader(request.get("x-forwarded-proto"));
  const protocol = forwardedProto ?? request.protocol ?? "https";
  return `${protocol}://${host}`.replace(/\/$/, "");
}

function publicOriginToWebSocketUrl(origin) {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function shouldUseRequestOrigin(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return isLocalHostname(url.hostname);
  } catch {
    return true;
  }
}

function isLocalHostname(hostname) {
  return ["127.0.0.1", "localhost", "0.0.0.0", "::1", "[::1]"].includes(hostname);
}

function firstForwardedHeader(value) {
  return String(value ?? "").split(",")[0]?.trim() || null;
}

function roomRequest(request, type) {
  return {
    ...request.body,
    deck: deckForRequest(request, type),
    type,
    roomCode: request.params.roomCode
  };
}

function deckForRequest(request, type) {
  if (request.body?.deck) return request.body.deck;
  return ["nextHand", "newMatch"].includes(type) ? createShuffledDeck() : undefined;
}

function sendBoundaryResponse(response, payload, onBoundaryResponse) {
  if (payload.ok && onBoundaryResponse) {
    onBoundaryResponse(payload);
  }
  response
    .status(payload.ok ? 200 : payload.statusCode)
    .json(payload);
}

function sendQueueResponse(response, payload, onQueueResponse) {
  if (payload.ok && onQueueResponse) {
    onQueueResponse(payload);
  }
  response
    .status(payload.ok ? 200 : payload.statusCode)
    .json(payload);
}

function safeQueueAction(action) {
  try {
    return action();
  } catch (error) {
    return {
      ok: false,
      statusCode: error.statusCode ?? 500,
      type: null,
      queue: {
        state: "error",
        waitingCount: 0,
        queued: false
      },
      match: null,
      view: null,
      spectatorView: null,
      error: {
        message: error.message ?? "Quick Match request failed"
      }
    };
  }
}
