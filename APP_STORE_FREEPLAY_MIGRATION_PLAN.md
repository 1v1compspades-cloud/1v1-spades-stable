# App Store Free-Play — Migration Plan

> **Status: PLAN ONLY. No implementation has begun.**
> This document scopes a free-play iOS App Store version of 1v1 Spades.
> It does **not** modify any gameplay, scoring, bidding, socket, tournament, KOTT, admin, reconnect, room-state, or match-logic code.

## Pre-start recovery point

- **Stable commit:** `45ccf19` (HEAD of `main`) — includes `STABLE_BUILD_NOTES.md`. Prior deployment checkpoint: `7aea54d` ("Published your App").
- **Working tree:** clean.
- **Rollback:** available through the workspace checkpoint history ("View Checkpoints") — you can restore to the stable build at any time. The completion of this planning step is itself a checkpoint, so this document marks the **pre-app-store-freeplay-start** recovery point.
- Note on naming: Replit checkpoints are auto-created with system-generated messages; a custom checkpoint name cannot be set from the agent. The stable point is instead pinned by commit (`45ccf19`) and documented in `STABLE_BUILD_NOTES.md`, which is the reliable way to recover this exact state here.

## Goal

Ship a casual, **free-play** Spades app to the iOS App Store (via Replit's Expo Launch) that reuses the existing, verified backend and game rules. "Free-play" means: casual head-to-head matches for fun, **no real-money, no wagering, no competitive tournament/admin/streamer surface** in v1.

## Guiding principle — additive only

The mobile app is a **new artifact plus a new shared library**. It must **not** edit the web app, the server game logic, or the socket event contracts in a breaking way. The web platform (`1v1spades.com`) and the backend stay exactly as they are. Any new server capability needed must be added **additively** (new optional events/fields) without changing existing behavior.

## What gets reused vs. rebuilt

### Reused as-is (no changes)
- **Backend:** Express + Socket.io server, full game engine (deck, bidding, trick-taking, scoring), in-memory room state. The mobile client speaks the same Socket.io protocol.
- **Game rules:** nil ±100, failed-nil still earns bag points, Race-to-250 (5 bags / −50), Race-to-500 (10 bags / −100). Server-authoritative and **frozen**.
- **Socket event contracts:** `create_room`, `join_room`, `reconnect_player`, `place_bid`, `play_card`, `set_ready` (client → server) and `game_state`, `round_over`, `trick_complete`, `opponent_disconnected` (server → client).

### Extract into a shared lib (`lib/spades-core`)
Pure, framework-free logic currently in `artifacts/spades-game/src/lib/game.ts` should be lifted into a workspace lib so web and mobile share one source of truth (no divergence):
- Types: `Card`, `Suit`, `Rank`, `GameState` (client view), and the enums/constants.
- Pure helpers: `isCardPlayable`, `sortHandBySuit`, `RANK_ORDER`, `SUIT_SYMBOLS`.
- This extraction is a **non-behavioral refactor**: the web app re-imports the same functions from the new lib; output is byte-for-byte identical. Done carefully it changes import paths only, not logic.

### Rebuilt for React Native (new Expo artifact)
Web-coupled pieces have no RN equivalent and are re-implemented:
- **UI:** shadcn/ui + Tailwind + framer-motion → React Native components, `StyleSheet`, Reanimated. New `Card`, table layout, bidding pad, scoreboard, coin-toss animation, round-summary, game-over.
- **Storage:** `localStorage` (`useGameStorage.ts`) → `AsyncStorage` (same keys/semantics for identity + reconnect token).
- **Routing:** `wouter` → `expo-router` file-based routes.
- **Browser APIs:** `navigator.clipboard` → `expo-clipboard`; in-app-browser banner dropped.
- **Socket context:** port `useSocket.tsx` state machine to RN; the only real change is the connection URL (absolute `https://${EXPO_PUBLIC_DOMAIN}` since Expo bundles run outside the web proxy) and storage layer.

## Free-play v1 scope

### In scope
- Casual identity (display name, persisted locally).
- **1v1 Quick Match:** create a room, share/enter a room code, play a full match to the chosen target (250 or 500).
- Full in-match experience: coin toss, bidding (incl. nil), card play with legal-move enforcement, trick/round/game-over flow, scoreboard.
- Reconnect after backgrounding/disconnect (per-seat token, same as web).

### Deferred (post-v1, evaluate later)
- **King of the Table** — natural Phase 2 (reuses the same room/socket model).
- **Spectator mode** on mobile.

### Out of scope for the App Store build
- **Tournaments** (bracket UI, host/player tokens) — competitive surface, heavier review + UX.
- **Host/Admin dashboard, Fast Finish, streamer tools** — operator-only; not for a consumer free-play app.
- **Web marketing/SEO pages** (`/rules` as full page, `/fair-play`, `/discord`, `sitemap.xml`, `robots.txt`) — a concise in-app rules screen replaces these.
- **Any payments / real-money / wagering.**

## Phased delivery (implementation happens later, after approval)

1. **Phase 0 — Freeze (DONE):** stable build documented (`STABLE_BUILD_NOTES.md`), verified, published; this plan written.
2. **Phase 1 — Core extraction + scaffold:** create `lib/spades-core` (non-behavioral), scaffold the Expo artifact, wire networking (`EXPO_PUBLIC_DOMAIN`, `setBaseUrl`).
3. **Phase 2 — Connectivity:** RN Socket context connecting to the existing backend; identity + AsyncStorage persistence; reconnect token handling.
4. **Phase 3 — Quick Match gameplay:** room create/join, table UI, bidding pad, card play, coin toss, round summary, game over, scoreboard.
5. **Phase 4 — Mobile polish:** Reanimated transitions, haptics, sound, empty/loading/disconnected states, safe-area + keyboard handling, on-device testing via Expo Go.
6. **Phase 5 — Store readiness:** app icon, splash, bundle identifier, short rules screen, privacy policy, App Store metadata.
7. **Phase 6 — Launch:** verify on device, then publish via Expo Launch (iOS).

## App Store considerations
- **iOS only via Expo Launch.** Google Play (Android) publishing is **not currently supported** on Replit — plan for iOS first.
- **Free-play framing** keeps review simple: no gambling, no real-money, no external payment links.
- **Privacy policy** required for submission; identity is ephemeral/local, which keeps the policy simple.
- **Static `app.json`** only (no `app.config.ts/js`); never change the bundle identifier after first set.
- **Expo Go compatibility:** stick to JS-only / Expo-Go-compatible libraries.

## Risks & mitigations
- **Socket lifecycle on mobile** (background/foreground): rely on the existing reconnect-token flow; test app-suspend/resume explicitly.
- **Rule drift between web and mobile:** mitigated by `lib/spades-core` as the single source for client-side rule helpers; server remains the authority.
- **Refactor risk in extraction:** Phase 1 must keep the web app's behavior identical — verify with the existing typecheck + scoring/tournament test suites before proceeding.

## Frozen contracts (must not change during the port)
Gameplay · scoring (nil values, bag penalties, set penalties, targets/tiebreaker) · bidding (coin toss, alternation, nil) · socket event contracts · tournament advancement/bracket · KOTT crown/rotation · admin permissions & token gating · reconnect logic · room-state model & sanitized views · match logic.

## Next step
Awaiting approval of this plan. **No implementation will start until you confirm.** When ready, Phase 1 (shared-core extraction + Expo scaffold) is the first executable step.
