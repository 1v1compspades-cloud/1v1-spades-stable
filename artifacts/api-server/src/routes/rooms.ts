import { Router, type Request } from "express";
import { createRoom, getRoom, getAllRooms } from "../game/engine.js";
import { checkIpRate } from "../lib/ipRateLimit.js";

const router = Router();

const MAX_TOTAL_ROOMS = 500;

function clientIpFromReq(req: Request): string {
  // With app.set("trust proxy", 1) Express resolves req.ip from the proxy's
  // X-Forwarded-For in a standards-compliant, non-spoofable way.
  return req.ip ?? "unknown";
}

router.post("/", (req, res) => {
  try {
    const { playerName } = req.body as { playerName?: string };
    if (!playerName || typeof playerName !== "string") {
      res.status(400).json({ error: "playerName is required" });
      return;
    }
    // Hard cap first — no bucket mutation needed when server is full.
    if (getAllRooms().length >= MAX_TOTAL_ROOMS) {
      res.status(503).json({ error: "Server is at capacity. Please try again later." });
      return;
    }
    const ip = clientIpFromReq(req);
    if (!checkIpRate(ip, "create_room", 20, 10 * 60_000)) {
      res.status(429).json({ error: "Too many rooms created from this network. Try again later." });
      return;
    }
    const state = createRoom(playerName.trim(), `http-${Date.now()}`);
    res.status(201).json({
      roomCode: state.roomCode,
      status: "waiting",
      playerCount: 1,
      createdAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

router.get("/:roomCode", (req, res) => {
  const { roomCode } = req.params as { roomCode: string };
  const state = getRoom(roomCode.toUpperCase().trim());
  if (!state) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const playerCount = state.players.filter(Boolean).length;
  res.json({
    roomCode: state.roomCode,
    status: state.phase === "waiting" ? "waiting" : state.phase === "game_over" ? "finished" : "playing",
    playerCount,
    createdAt: new Date().toISOString(),
  });
});

export default router;
