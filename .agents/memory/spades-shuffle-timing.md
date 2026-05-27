---
name: Spades shuffle timing budget
description: The client deal animation must fit inside the server's SHUFFLE_ANIMATION_MS gate.
---

Client `ShuffleOverlay` total duration (stagger × cards + fly + discard) must be ≤ server `SHUFFLE_ANIMATION_MS` (currently 2600ms in `socket.ts` `dealWithShuffleAnimation`).

**Why:** Server gates the post-shuffle `game_state` emit behind a `setTimeout(SHUFFLE_ANIMATION_MS)`. If the client animation runs longer, the dealt hand pops in mid-shuffle and players see cards rearrange under the overlay. If much shorter, players stare at a frozen overlay.

**How to apply:** When tweaking deal stagger or fly-in durations, recompute `(13 * 2) * DEAL_STAGGER_MS + DEAL_FLY_MS + discard_tail` and keep it under the server gate. If you need a longer animation, bump the server constant in lockstep — don't ship them out of sync.
