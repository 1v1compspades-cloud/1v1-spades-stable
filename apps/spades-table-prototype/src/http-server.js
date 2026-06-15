import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalAccountStatsStore } from "./local-account-stats.js";
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
  pushNotifier = createSpadesPushNotifier(),
  accountStatsStore = createLocalAccountStatsStore({ storage: null, namespace: "spadesServer" })
} = {}) {
  const app = express();
  app.use(express.json({ limit: "128kb" }));

  const handleBoundaryResponse = (payload) => {
    recordCompletedMatchPreview({ payload, boundary, accountStatsStore });
    onBoundaryResponse?.(payload);
  };

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
    }), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/join", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "joinRoom")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/ready", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "ready")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/bid", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "bid")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/play-card", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "playCard")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/leave", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "leaveRoom")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/next-hand", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "nextHand")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/new-match", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "newMatch")), handleBoundaryResponse);
  });

  app.post("/api/rooms/:roomCode/rematch", (request, response) => {
    sendBoundaryResponse(response, boundary.handle(roomRequest(request, "rematch")), handleBoundaryResponse);
  });

  app.get("/api/accounts/:playerId/stats", (request, response) => {
    response.json({
      ok: true,
      playerId: String(request.params.playerId ?? ""),
      stats: accountStatsStore.getPlayerStats(request.params.playerId),
      freePlayOnly: true
    });
  });

  app.get("/api/leaderboards/local", (request, response) => {
    const limit = normalizeLimit(request.query.limit);
    response.json({
      ok: true,
      leaderboard: accountStatsStore.getLeaderboard({ limit }),
      scope: "server-preview",
      freePlayOnly: true
    });
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
    accountStatsStore,
    repository: boundary.repository
  };
}

function recordCompletedMatchPreview({ payload, boundary, accountStatsStore }) {
  if (!payload?.ok || payload.view?.phase !== "match_complete") return;
  const room = boundary.repository.get(payload.view.roomCode);
  if (!room?.players?.player1?.playerId || !room?.players?.player2?.playerId) return;

  const summary = payload.view.handSummary;
  accountStatsStore.recordMatch({
    id: `${room.roomCode}-${room.handNumber}-${room.game.winner}-${room.updatedAt}`,
    roomCode: room.roomCode,
    timestamp: room.updatedAt,
    winner: room.game.winner,
    players: {
      player1: publicPlayer(room.players.player1, "Player 1"),
      player2: publicPlayer(room.players.player2, "Player 2")
    },
    finalScore: { ...room.game.score },
    bids: { ...room.game.bids },
    bags: { ...room.game.bags },
    nilResults: {
      player1: summary?.players?.player1?.nilResult ?? null,
      player2: summary?.players?.player2?.nilResult ?? null
    }
  });
}

function publicPlayer(player, fallbackDisplayName) {
  return {
    playerId: player.playerId,
    displayName: player.displayName ?? fallbackDisplayName
  };
}

function normalizeLimit(value) {
  const limit = Number.parseInt(String(value ?? "10"), 10);
  if (!Number.isFinite(limit)) return 10;
  return Math.max(1, Math.min(50, limit));
}

function publicHealthConfig(config, request) {
  const requestOrigin = publicOriginFromRequest(request);
  const publicApiUrl = requestOrigin
    ? requestOrigin
    : config?.publicApiUrl ?? requestOrigin ?? null;
  const publicWebSocketUrl = requestOrigin
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
