---
name: Spades stale-sweep semantics
description: How the in-memory room/tournament sweeper decides what is stale, and why timestamp choice matters.
---

Sweep "complete" entities by their **completion** timestamp, not `createdAt`.

**Why:** A tournament/room can run for hours. If the sweep threshold is `now - createdAt > 1h`, a long match finishes already past the threshold and is deleted within one sweep tick — users hitting Refresh on the game-over screen see "tournament not found" data loss.

**How to apply:** Any entity whose terminal state has a meaningful retention window needs its own `completedAt` (or `statusChangedAt`) set at the transition site. Sweeper checks `now - (completedAt ?? createdAt) > THRESHOLD`. Same pattern applies to rooms in `game_over` — prefer `lastActiveAt` or a dedicated `endedAt` over `createdAt`.
