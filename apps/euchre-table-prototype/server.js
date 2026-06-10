import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  advanceRoomClock,
  applyRoomAction,
  createRoom,
  getViewerSeat,
  joinRoom,
  sanitizeRoomForViewer
} from "./src/room-state.js";
import {
  defaultPersistenceFile,
  loadPersistedState,
  savePersistedState
} from "./src/persistence.js";
import {
  adminRecordMatchWinner,
  createTournament,
  exportTournamentBackup,
  joinTournament,
  recordMatchWinner,
  resetTournamentLobby,
  sanitizeTournamentForAdmin,
  sanitizeTournamentForViewer,
  startTournament,
  validateTournamentBracket,
  verifyTournamentAdmin
} from "./src/tournament-state.js";

const appName = "1v1-euchre-freeplay";
const buildId = "race-to-5-proof-2026-06-10";
const port = Number.parseInt(process.env.PORT ?? "5174", 10);
const host = process.env.HOST ?? "0.0.0.0";
const appDir = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(join(appDir, "../.."));
const persistenceFile = defaultPersistenceFile(appDir);
const persistedState = loadPersistedState(persistenceFile);
const rooms = persistedState.rooms;
const tournaments = persistedState.tournaments;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/healthz") {
      sendJson(response, 200, {
        ok: true,
        app: appName
      });
      return;
    }

    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, error.statusCode ?? 500, {
      error: error.message || "Unexpected server error"
    });
  }
});

server.listen(port, host, () => {
  console.log(`${appName} server listening on ${host}:${port}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(request);
    const matchSettings = createMatchSettingsFromBody(body);
    console.log("[raceTo] create room API received", {
      raceTo: matchSettings.raceTo,
      modeId: matchSettings.modeId
    });
    const room = createUniqueRoom({
      displayName: requiredDisplayName(body.displayName),
      playerId: body.playerId,
      matchSettings
    });
    console.log("[raceTo] saved room matchSettings", {
      roomCode: room.roomCode,
      matchSettings: room.matchSettings
    });
    rooms.set(room.roomCode, room);
    persistState();
    const seatToken = room.players.player1.seatToken;

    sendJson(response, 201, {
      seat: "player1",
      seatToken,
      room: sanitizeRoomForViewer(room, seatToken)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/quick-match") {
    sendJson(response, 202, {
      status: "placeholder",
      message: "Quick Match coming next."
    });
    return;
  }

  if (request.method === "GET" && segments[1] === "debug" && segments[2] === "rooms" && segments[3] && segments[4] === "settings") {
    const roomCode = segments[3].toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) throw httpError(404, "Room not found");

    const safeRoom = sanitizeRoomForViewer(room, null);
    sendJson(response, 200, {
      roomCode,
      matchSettings: safeRoom.matchSettings,
      gameStateTargetScore: safeRoom.gameState.targetScore,
      raceTo: safeRoom.matchSettings?.raceTo ?? safeRoom.gameState?.targetScore ?? null,
      legacyModeTargetScore: room.gameState?.mode?.targetScore ?? null
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tournaments") {
    const body = await readJson(request);
    const tournament = createUniqueTournament({
      bracketSize: Number(body.bracketSize ?? 4),
      matchSettings: createMatchSettingsFromBody(body)
    });
    tournaments.set(tournament.tournamentCode, tournament);
    persistState();

    sendJson(response, 201, {
      adminKey: tournament.adminKey,
      tournament: sanitizeTournamentForViewer(tournament)
    });
    return;
  }

  if (segments[0] === "api" && segments[1] === "tournaments" && segments[2]) {
    const tournamentCode = segments[2].toUpperCase();
    const tournament = tournaments.get(tournamentCode);
    if (!tournament) throw httpError(404, "Tournament not found");

    if (request.method === "GET" && segments.length === 3) {
      sendJson(response, 200, {
        tournament: sanitizeTournamentForViewer(tournament)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "join") {
      const body = await readJson(request);
      const nextTournament = joinTournament(tournament, {
        displayName: body.displayName
      });
      tournaments.set(tournamentCode, nextTournament);
      persistState();

      sendJson(response, 200, {
        tournament: sanitizeTournamentForViewer(nextTournament)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "admin" && segments[4] === "verify") {
      const body = await readJson(request);
      verifyTournamentAdmin(tournament, body.adminKey);
      sendJson(response, 200, {
        tournament: sanitizeTournamentForAdmin(tournament, body.adminKey)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "admin" && segments[4] === "start") {
      const body = await readJson(request);
      const nextTournament = startTournament(tournament, {
        adminKey: body.adminKey,
        createMatchRoom: createTournamentMatchRoom
      });
      tournaments.set(tournamentCode, nextTournament);
      persistState();
      sendJson(response, 200, {
        tournament: sanitizeTournamentForAdmin(nextTournament, body.adminKey)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "admin" && segments[4] === "reset-lobby") {
      const body = await readJson(request);
      const nextTournament = resetTournamentLobby(tournament, {
        adminKey: body.adminKey
      });
      tournaments.set(tournamentCode, nextTournament);
      persistState();
      sendJson(response, 200, {
        tournament: sanitizeTournamentForAdmin(nextTournament, body.adminKey)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "admin" && segments[4] === "validate-bracket") {
      const body = await readJson(request);
      sendJson(response, 200, {
        validation: validateTournamentBracket(tournament, {
          adminKey: body.adminKey
        }),
        tournament: sanitizeTournamentForAdmin(tournament, body.adminKey)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "admin" && segments[4] === "export") {
      const body = await readJson(request);
      sendJson(response, 200, {
        backup: exportTournamentBackup(tournament, {
          adminKey: body.adminKey
        })
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "admin" && segments[4] === "matches" && segments[5] && segments[6] === "winner") {
      const body = await readJson(request);
      const nextTournament = adminRecordMatchWinner(tournament, {
        adminKey: body.adminKey,
        round: Number(body.round),
        matchId: segments[5],
        winnerId: body.winnerId,
        source: body.source ?? "admin_mark_winner",
        createMatchRoom: createTournamentMatchRoom
      });
      tournaments.set(tournamentCode, nextTournament);
      persistState();

      sendJson(response, 200, {
        tournament: sanitizeTournamentForAdmin(nextTournament, body.adminKey)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "matches" && segments[4] && segments[5] === "winner") {
      throw httpError(403, "Match result updates must come from completed rooms or verified host controls");
    }
  }

  if (segments[0] === "api" && segments[1] === "rooms" && segments[2]) {
    const roomCode = segments[2].toUpperCase();
    let room = rooms.get(roomCode);
    if (!room) throw httpError(404, "Room not found");
    room = advanceAndSaveRoom(room);

    if (request.method === "GET" && segments.length === 3) {
      const seatToken = url.searchParams.get("seatToken");
      sendJson(response, 200, {
        room: sanitizeRoomForViewer(room, seatToken)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "join") {
      const body = await readJson(request);
      const viewerSeat = getViewerSeat(room, body.seatToken);
      const result = joinRoom(room, {
        seatToken: body.seatToken,
        playerId: body.playerId,
        displayName: viewerSeat === "spectator"
          ? requiredDisplayName(body.displayName)
          : body.displayName
      });
      const nextRoom = advanceAndSaveRoom(result.room);
      sendJson(response, 200, {
        seat: result.seat,
        seatToken: result.seatToken,
        room: sanitizeRoomForViewer(nextRoom, result.seatToken)
      });
      return;
    }

    if (request.method === "POST" && segments[3] === "actions") {
      const body = await readJson(request);
      const nextRoom = advanceAndSaveRoom(applyRoomAction(room, body));
      sendJson(response, 200, {
        room: sanitizeRoomForViewer(nextRoom, body.seatToken)
      });
      return;
    }
  }

  throw httpError(404, "Not found");
}

function advanceAndSaveRoom(room) {
  const nextRoom = advanceRoomClock(room);
  rooms.set(nextRoom.roomCode, nextRoom);
  syncTournamentFromRoom(nextRoom);
  persistState();
  return nextRoom;
}

function persistState() {
  savePersistedState(persistenceFile, { rooms, tournaments });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname === "/") {
    response.writeHead(302, {
      Location: "/apps/euchre-table-prototype/home.html"
    });
    response.end();
    return;
  }

  const pathname = publicRoutePath(url.pathname);
  const safePath = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(join(rootDir, safePath));

  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    sendJson(response, 404, { error: "File not found" });
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": cacheControl(filePath),
    "X-1v1Euchre-Build": buildId
  });
  createReadStream(filePath).pipe(response);
}

function publicRoutePath(pathname) {
  if (pathname.startsWith("/src/")) {
    return `/apps/euchre-table-prototype${pathname}`;
  }

  return {
    "/home.html": "/apps/euchre-table-prototype/home.html",
    "/room.html": "/apps/euchre-table-prototype/room.html",
    "/game.html": "/apps/euchre-table-prototype/game.html",
    "/rules.html": "/apps/euchre-table-prototype/rules.html",
    "/tournament.html": "/apps/euchre-table-prototype/tournament.html"
  }[pathname] ?? pathname;
}

function createUniqueRoom({ displayName, playerId, matchSettings } = {}) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const room = createRoom({ displayName, playerId, matchSettings });
    if (!rooms.has(room.roomCode)) return room;
  }

  throw httpError(500, "Could not generate a unique room code");
}

function createMatchSettingsFromBody(body = {}) {
  const nestedSettings = body.matchSettings ?? body.settings ?? {};

  return {
    modeId: nestedSettings.modeId ?? body.modeId ?? body.mode,
    raceTo: nestedSettings.raceTo
      ?? nestedSettings.matchTarget
      ?? nestedSettings.targetScore
      ?? nestedSettings.scoreLimit
      ?? nestedSettings.winningScore
      ?? body.raceTo
      ?? body.matchTarget
      ?? body.targetScore
      ?? body.scoreLimit
      ?? body.winningScore,
    stickTheDealer: nestedSettings.stickTheDealer ?? body.stickTheDealer
  };
}

function createUniqueTournament({ bracketSize, matchSettings }) {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const tournament = createTournament({ bracketSize, matchSettings });
    if (!tournaments.has(tournament.tournamentCode)) return tournament;
  }

  throw httpError(500, "Could not generate a unique tournament code");
}

function createTournamentMatchRoom({ tournamentCode, round, matchNumber, player1, player2, matchSettings }) {
  const baseRoomCode = `${tournamentCode.slice(0, 4)}${round}${matchNumber}`;
  let roomCode = baseRoomCode;
  let suffix = 1;

  while (rooms.has(roomCode)) {
    roomCode = `${baseRoomCode}${suffix}`;
    suffix += 1;
  }

  const room = createRoom({
    roomCode,
    matchSettings,
    tournamentMatch: {
      tournamentCode,
      round,
      matchId: `r${round}m${matchNumber}`,
      player1,
      player2,
      status: "active",
      winner: null
    }
  });
  rooms.set(roomCode, room);
  return room;
}

function syncTournamentFromRoom(room) {
  if (!room.tournamentMatch || room.gameState.phase !== "match_complete" || !room.gameState.winner) {
    return;
  }

  const tournament = tournaments.get(room.tournamentMatch.tournamentCode);
  if (!tournament) return;

  const winnerId = room.gameState.winner === "player1"
    ? room.tournamentMatch.player1?.id
    : room.tournamentMatch.player2?.id;

  if (!winnerId) return;

  try {
    const nextTournament = recordMatchWinner(tournament, {
      round: room.tournamentMatch.round,
      matchId: room.tournamentMatch.matchId,
      winnerId,
      createMatchRoom: createTournamentMatchRoom
    });
    tournaments.set(tournament.tournamentCode, nextTournament);
  } catch (error) {
    if (error.statusCode !== 409) throw error;
  }
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(value));
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requiredDisplayName(displayName) {
  const name = String(displayName ?? "").trim();
  if (!name) throw httpError(400, "Enter your name to continue.");
  return name;
}

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[extname(filePath)] ?? "application/octet-stream";
}

function cacheControl(filePath) {
  if ([".html", ".js", ".css"].includes(extname(filePath))) {
    return "no-store, max-age=0";
  }

  return "no-cache";
}
