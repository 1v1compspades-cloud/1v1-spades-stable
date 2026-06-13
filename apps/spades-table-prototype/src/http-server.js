import express from "express";
import { createSpadesServerBoundary } from "./server-boundary.js";

export function createSpadesHttpServer({
  boundary = createSpadesServerBoundary(),
  onBoundaryResponse = null
} = {}) {
  const app = express();
  app.use(express.json({ limit: "128kb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "spades-table-prototype",
      transport: "http-local"
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
