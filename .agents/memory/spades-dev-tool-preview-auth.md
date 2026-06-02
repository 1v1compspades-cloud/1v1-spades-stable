---
name: Spades dev/preview tool authorization
description: Why a "dev/preview OR admin" server gate is not enough for match-mutating tools, and the seated-actor rule that closes the gap.
---

# Dev/preview-gated tools must still bind to a room role

A server gate of the form "allow if `NODE_ENV !== "production"` OR unlocked admin" is NOT sufficient on its own for any action that mutates a live match (e.g. the Fast Finish / End Game test tool).

**Why:** the Replit preview/dev URL is publicly reachable and can be shared. In that environment the `NODE_ENV` branch grants *every connected socket* — including spectators and random visitors — the privileged action. A spectator could then end / disrupt matches via a direct socket emit even though the client hides the button.

**How to apply:** for match-mutating dev tools, when the actor is authorized only by environment (the non-admin "Dev" path), ALSO require that the socket is a **seated player in the target room** (`room.players.some(p => p?.socketId === socket.id)`). Keep real admins (`adminSockets`) exempt, because the streamer/host legitimately drives KotT and tournament rooms from the sidelines (spectating). Mirror the same split in the client visibility gate: `isAdmin || (import.meta.env.DEV && !spectator)`. The client gate is cosmetic; the server seat check is the real boundary. This matches how `place_bid` / `play_card` are already seat-gated.
