import { Router, type IRouter, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import type { Server as SocketIOServer } from "socket.io";
import { getAllRooms } from "../game/engine.js";
import { getAllTournaments } from "../game/tournament.js";
import { getConnectionStats } from "../game/socket.js";

const router: IRouter = Router();

const SERVER_STARTED_AT = Date.now();

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function isAuthorized(req: Request): boolean {
  const expected = process.env["SESSION_SECRET"];
  if (!expected) return false;
  const headerToken =
    (req.headers["x-admin-token"] as string | undefined) ?? "";
  const queryToken =
    typeof req.query["token"] === "string" ? (req.query["token"] as string) : "";
  const provided = headerToken || queryToken;
  if (!provided) return false;
  return constantTimeEqual(provided, expected);
}

router.get("/stats", (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    const io = req.app.locals["io"] as SocketIOServer | undefined;
    const rooms = getAllRooms();
    const tournaments = getAllTournaments();

    const byPhase: Record<string, number> = {};
    const byMode: Record<string, number> = {};
    let activePlayers = 0;
    let activeSpectators = 0;
    let activeGameRooms = 0;

    for (const r of rooms) {
      byPhase[r.phase] = (byPhase[r.phase] ?? 0) + 1;
      byMode[r.mode] = (byMode[r.mode] ?? 0) + 1;
      activePlayers += r.players.filter(Boolean).length;
      activeSpectators += r.spectators?.length ?? 0;
      if (r.phase !== "game_over") activeGameRooms += 1;
    }

    const tournamentsByStatus: Record<string, number> = {};
    for (const t of tournaments) {
      tournamentsByStatus[t.status] = (tournamentsByStatus[t.status] ?? 0) + 1;
    }

    const conn = getConnectionStats();

    res.json({
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor((Date.now() - SERVER_STARTED_AT) / 1000),
      serverStartedAt: new Date(SERVER_STARTED_AT).toISOString(),
      sinceLastReset: {
        totalConnections: conn.totalConnectionsSinceStart,
        uniqueVisitors: conn.uniqueVisitors,
        peakConcurrentSockets: conn.peakConcurrentSockets,
      },
      live: {
        connectedSockets: io?.engine?.clientsCount ?? 0,
        activePlayersInRooms: activePlayers,
        activeSpectators,
        activeGameRooms,
        totalRoomsInMemory: rooms.length,
        liveTournaments:
          (tournamentsByStatus["lobby"] ?? 0) +
          (tournamentsByStatus["active"] ?? 0),
        totalTournamentsInMemory: tournaments.length,
      },
      breakdown: {
        roomsByPhase: byPhase,
        roomsByMode: byMode,
        tournamentsByStatus,
      },
      notes: [
        "All numbers are in-memory only and reset on server restart.",
        "sinceLastReset.uniqueVisitors counts distinct client IPs since the server last started; totalConnections counts every socket connection (refreshes/reconnects included).",
        "Persistent cross-restart analytics are not yet wired up.",
      ],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
