import { Router } from "express";
import { createRoom, getRoom } from "../game/engine.js";

const router = Router();

router.post("/", (req, res) => {
  try {
    const { playerName } = req.body as { playerName?: string };
    if (!playerName || typeof playerName !== "string") {
      res.status(400).json({ error: "playerName is required" });
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
