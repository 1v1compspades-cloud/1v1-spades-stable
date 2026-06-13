import express from "express";
import { createSpadesServerBoundary } from "./server-boundary.js";

export function createSpadesHttpServer({
  boundary = createSpadesServerBoundary()
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
    }));
  });

  app.post("/api/rooms/:roomCode/join", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "joinRoom")));
  });

  app.post("/api/rooms/:roomCode/ready", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "ready")));
  });

  app.post("/api/rooms/:roomCode/bid", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "bid")));
  });

  app.post("/api/rooms/:roomCode/play-card", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "playCard")));
  });

  app.post("/api/rooms/:roomCode/leave", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "leaveRoom")));
  });

  app.post("/api/rooms/:roomCode/next-hand", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "nextHand")));
  });

  app.post("/api/rooms/:roomCode/new-match", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "newMatch")));
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

function sendBoundaryResponse(response, payload) {
  response
    .status(payload.ok ? 200 : payload.statusCode)
    .json(payload);
}
