---
name: Spades deal/shuffle overlay timing budget
description: Why the ShuffleOverlay timeline must fit a fixed server window and stay purely visual.
---

The in-app shuffle/deal animation (`ShuffleOverlay.tsx`) is a **pure client visual**. The server independently holds `phase="shuffling"` for a fixed window (`SHUFFLE_ANIMATION_MS`, ~3100ms in `socket.ts`) and then advances to the next phase regardless of the client.

**Rule:** every stage of the overlay's timeline (and the longest in-flight card transition/stagger) must finish comfortably under that server window, or the animation gets cut off mid-motion when the phase flips.

**Why:** the overlay does NOT gate or signal the server — it cannot extend the window. The two timers are decoupled, so the client timeline is the only thing under your control and must be budgeted against the server constant.

**How to apply:** if you re-time stages or add a stage, recompute `stageStart + (count * staggerMs) + transitionMs` for the last card and keep it < `SHUFFLE_ANIMATION_MS`. Never add server round-trips to "sync" the animation. The Skip button is local per-round UI state (`dealSkipped` in `Room.tsx`), intentionally not persisted, and must never emit sockets or touch game state.
