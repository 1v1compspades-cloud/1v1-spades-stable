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

  app.get("/privacy", (_request, response) => {
    response.type("html").send(renderPublicInfoPage({
      title: "Privacy Policy",
      heading: "Spades Free Play Privacy Policy",
      updated: "June 16, 2026",
      sections: [
        {
          heading: "Free-play beta",
          paragraphs: [
            "Spades Free Play is a free-play head-to-head card game beta. It does not offer real-money gambling, wagers, prizes, payments, or tournament entry fees."
          ]
        },
        {
          heading: "Information used by the beta",
          paragraphs: [
            "The app uses a display name, local player identity, room code, and room session data so you can create, join, reconnect to, and play free-play rooms.",
            "Bug reports can include public room status, current phase, viewer seat, last action, last error, and hidden-hand safety checks. Bug diagnostics are designed not to include hidden hands, private seat tokens, admin keys, or secrets."
          ]
        },
        {
          heading: "Local storage and notifications",
          paragraphs: [
            "The web beta stores local identity and reconnect data on your device. If push notifications are enabled, a push token may be registered for game-attention alerts."
          ]
        },
        {
          heading: "Contact",
          paragraphs: [
            "For privacy or support questions, use Report Bug in the app or email 1v1compspades@gmail.com."
          ]
        }
      ]
    }));
  });

  app.get("/terms", (_request, response) => {
    response.type("html").send(renderPublicInfoPage({
      title: "Terms of Use",
      heading: "Spades Free Play Terms of Use",
      updated: "June 16, 2026",
      sections: [
        {
          heading: "Free-play use only",
          paragraphs: [
            "Spades Free Play is provided for free-play entertainment and beta testing. Do not use the app for real-money gambling, wagers, prizes, payments, or paid tournament entry."
          ]
        },
        {
          heading: "Fair play",
          paragraphs: [
            "Do not exploit bugs, harass other players, impersonate other users, or attempt to access hidden hands, private room credentials, server internals, or admin-only data."
          ]
        },
        {
          heading: "Beta availability",
          paragraphs: [
            "Rooms are beta sessions and may reset during deploys, service restarts, or maintenance. In-memory beta rooms are not guaranteed to persist."
          ]
        },
        {
          heading: "Support",
          paragraphs: [
            "Use Report Bug in the app or email 1v1compspades@gmail.com for help."
          ]
        }
      ]
    }));
  });

  app.get("/support", (_request, response) => {
    response.type("html").send(renderPublicInfoPage({
      title: "Support",
      heading: "Spades Free Play Support",
      updated: "June 16, 2026",
      sections: [
        {
          heading: "Get help",
          paragraphs: [
            "Use Report Bug inside the app when something feels wrong. Include the room code, current phase, what you tapped, what you expected, and what happened instead.",
            "You can also email 1v1compspades@gmail.com for support."
          ]
        },
        {
          heading: "Common beta fixes",
          paragraphs: [
            "If a room seems stuck, tap Home, then Reconnect to Current Game. If that does not work, refresh the page and reconnect from the same device."
          ]
        },
        {
          heading: "Free-play reminder",
          paragraphs: [
            "This beta is free play only and does not include payments, prizes, wagers, or real-money gambling."
          ]
        }
      ]
    }));
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

function renderPublicInfoPage({ title, heading, updated, sections }) {
  const sectionHtml = sections.map((section) => `
      <section>
        <h2>${escapeHtml(section.heading)}</h2>
        ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n        ")}
      </section>`).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} - Spades Free Play</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #050604; color: #f8f4e7; }
      main { width: min(760px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 64px; }
      a { color: #f5c542; }
      .eyebrow { color: #f5c542; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
      h1 { margin: 8px 0 12px; font-family: Georgia, serif; font-size: clamp(2rem, 8vw, 4rem); line-height: 0.95; }
      h2 { margin: 28px 0 8px; color: #f5d36b; font-size: 1.05rem; letter-spacing: 0.04em; text-transform: uppercase; }
      p { color: #e6dfcf; font-size: 1rem; line-height: 1.65; }
      .panel { border: 1px solid rgba(245, 197, 66, 0.42); border-radius: 18px; background: linear-gradient(145deg, rgba(19, 38, 28, 0.95), rgba(6, 7, 5, 0.96)); padding: 24px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45); }
      .back { display: inline-flex; margin-top: 28px; color: #0a0804; background: linear-gradient(180deg, #ffe88d, #d99b12); border-radius: 999px; padding: 10px 16px; font-weight: 900; text-decoration: none; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Spades Free Play</p>
      <div class="panel">
        <h1>${escapeHtml(heading)}</h1>
        <p>Last updated: ${escapeHtml(updated)}</p>
${sectionHtml}
        <a class="back" href="/">Back to Spades</a>
      </div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
