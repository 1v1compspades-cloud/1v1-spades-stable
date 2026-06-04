---
name: Spades free-play mobile port (Expo)
description: How the iOS/Expo free-play app reuses the existing web/server socket contract with zero server changes.
---

# Spades free-play mobile port

The Expo app `artifacts/spades-freeplay` plays live 1v1 Spades by speaking the
EXACT same Socket.io events as the web client against the SAME API server — no
server changes. It connects to `https://${EXPO_PUBLIC_DOMAIN}` path `/socket.io`
(shared Replit proxy routes it to the API server).

**Why no server changes:** `create_room` and `join_room` both call
`broadcastState` right after their ack, so a fresh client receives initial state
via the `game_state` listener — no forced reconnect on first entry. A full free
game (waiting → ready → start → coin_toss → shuffling → bidding → playing →
round_over → game_over) runs entirely on existing safe events.

**Quick Match is a shareable private table, NOT random matchmaking.**
**Why:** there is NO server event for random/auto-pairing. Adding one would be a
server change (out of scope for the free-play port). So "Quick Match" =
`create_room` with `mode:"quick"` and a shareable code, same as play-a-friend.

**Constraints that bind this app:** free-play only; only quick 1v1 / private
table wired; NO tournament/KotT/admin/cash/gambling features or user-facing
wording; never reimplement scoring/bidding/deck/legal-play — server is the sole
authority (only a UI follow-suit *hint* is allowed client-side).

**Seat source-of-truth:** derive the player's seat from the route param, else the
persisted AsyncStorage session — never silently default to seat 0, or the seat-1
player gets mislabeled turns/scores.
