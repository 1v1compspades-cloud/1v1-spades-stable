import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createQuickMatchQueue } from "./quick-match.js";
import { createSpadesServerBoundary } from "./server-boundary.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(sourceDir, "..");
const indexPath = resolve(appDir, "index.html");

export function createSpadesHttpServer({
  boundary = createSpadesServerBoundary(),
  onBoundaryResponse = null,
  quickMatchQueue = createQuickMatchQueue({ boundary }),
  onQueueResponse = null,
  config = null
} = {}) {
  const app = express();
  app.use(express.json({ limit: "128kb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "spades-table-prototype",
      transport: "http-local",
      websocket: "enabled",
      publicApiUrl: config?.publicApiUrl ?? null,
      publicWebSocketUrl: config?.publicWebSocketUrl ?? null
    });
  });

  app.post("/api/rooms", (request, response) => {
    sendBoundaryResponse(response, boundary.handle({
      ...request.body,
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
    repository: boundary.repository
  };
}

function roomRequest(request, type) {
  return {
    ...request.body,
    type,
    roomCode: request.params.roomCode
  };
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
