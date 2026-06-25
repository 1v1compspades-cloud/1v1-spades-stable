import { Router, type IRouter, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import type { Server as SocketIOServer } from "socket.io";
import { db } from "@workspace/db";
import { getAllRooms } from "../game/engine.js";
import { getAllTournaments } from "../game/tournament.js";
import { getConnectionStats } from "../game/socket.js";
import {
  resetV11TestAccounts,
  V11TestAccountResetError,
} from "../lib/v11-test-account-reset.js";

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
        reconnectTelemetry: conn.reconnectTelemetry,
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

function v11RecoverySecret(): string | null {
  return (
    process.env["V11_ACCOUNT_RECOVERY_SECRET"] ||
    process.env["SESSION_SECRET"] ||
    null
  );
}

router.post("/v1.1/test-account-reset", async (req, res) => {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  if (req.body?.confirm !== "RESET_STAGING_TEST_ACCOUNTS") {
    res.status(400).json({
      ok: false,
      code: "confirmation_required",
      message: "Set confirm to RESET_STAGING_TEST_ACCOUNTS.",
    });
    return;
  }

  try {
    const result = await resetV11TestAccounts(
      db,
      {
        accountId: req.body?.accountId,
        displayName: req.body?.displayName,
        email: req.body?.email,
        keepAccountId: req.body?.keepAccountId ?? req.body?.keeperAccountId,
      },
      {
        recoverySecret: v11RecoverySecret(),
      },
    );
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof V11TestAccountResetError) {
      res.status(error.code === "not_allowed" ? 403 : 400).json({
        ok: false,
        code: error.code,
        message: error.message,
      });
      return;
    }
    res.status(500).json({
      ok: false,
      code: "test_account_reset_error",
      message: "Test account reset failed.",
    });
  }
});

export default router;
