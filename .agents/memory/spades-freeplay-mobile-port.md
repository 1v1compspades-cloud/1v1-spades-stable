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

## Animations must render in BOTH web preview and on-device
Use React Native's built-in `Animated` API for free-play animations, with
`useNativeDriver` gated to native only (`Platform.OS !== "web"`).
**Why:** the app is verified via the Replit **web** preview (expo.riker domain),
where the native animated module is absent — `useNativeDriver:true` warns and
falls back, and react-native-reanimated worklets can misbehave. Gating keeps the
web preview clean while still running on the UI thread on device.
**How to apply:** define `const NATIVE = Platform.OS !== "web";` and pass
`useNativeDriver: NATIVE`. Only animate transform/opacity. Guard phase-chained
Animated callbacks with a `cancelled` ref and call `stopAnimation()` on every
value in the effect cleanup, so a screen unmount mid-deal can't setState/zombie.

## Teaching visuals are standalone, never wired into the live game
The deal/shuffle/graveyard teaching animation is a separate route
(`app/learn-deal.tsx`), reached from the Rules page — NOT injected into the live
`game.tsx` shuffling phase. **Why:** touching game.tsx risks coupling decorative
timing to real socket-driven game state (a protected boundary). Keep teaching
screens fully decoupled from gameplay wiring.
