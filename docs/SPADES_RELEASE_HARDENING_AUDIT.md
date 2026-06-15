# 1V1 Competitive Spades Release Hardening Audit

Date: 2026-06-15

## App Map

### Live Hosted Web App

- Path: `apps/spades-table-prototype`
- Public URL: `https://1v1spades.com`
- Health: `https://1v1spades.com/health`
- WebSocket: `wss://1v1spades.com/ws`
- Test command: `npm test`
- Hosted smoke command: `npm run smoke:hosted -- https://1v1spades.com`

### Capacitor iOS Wrapper

- Path: `/Users/Shaw/Documents/spades new arch/apps/spades-ios-wrapper`
- Hosted URL: `https://1v1spades.com/?transport=real-server&app=ios`
- Bundle ID: `com.oneononespades.freeplay`
- Test command: `npm test`
- Build path: Capacitor/Xcode, not EAS.

### Expo/EAS Spades App Candidate

- Path: `/Users/Shaw/Downloads/spades-project/artifacts/spades-freeplay`
- Hosted domain env: `EXPO_PUBLIC_DOMAIN=1v1spades.com`
- Bundle ID: `com.oneononespades.freeplay`
- Current observed iOS build number: `17`
- Note: this workspace has pre-existing uncommitted changes and should be handled separately from the live hosted web app.

## Screens And Surfaces Found

### Production Player Surfaces

- Home: player name, create room, join room, spectator join, reconnect, Find Match, copy/invite helpers.
- Lobby/pre-game: represented by Home plus active room/invite bar and waiting phase guidance.
- Quick Match: `#join-quick-match`, hosted queue endpoints, and `quick-match.js`.
- Play Friend: create/join room code flow.
- Table: room/table status surface, public opponent/score/trick areas, table-level leave/rematch controls.
- Play: ready state, bidding controls, playable cards, current/last trick, hand and match completion controls.
- Spectator: explicit Spectate Room action plus automatic spectator seat when room is full.
- Reconnect: Reconnect to Current Game and server snapshot recovery.
- Results: hand summary, match history, match complete guidance, next hand/rematch controls.
- Report Bug: sanitized beta diagnostics and local issue history.

### Developer Or Preview Surfaces

- Manual QA tools: fixture presets, two-seat visual compare, visual QA scripts.
- Local account stats: local wins/losses/match history preview only.
- Local leaderboard: local preview only, not production rankings.
- Tournament history: local snapshot preview only.
- Advanced diagnostics: hidden from normal tester mode.

### Missing Or Not Production-Ready Yet

- Full production accounts/login/signup/profile.
- Durable global leaderboard service.
- 4/8/16/32-player tournament bracket lifecycle.
- Tournament host/admin tools: forfeit, mark winner, remake room, validate bracket, manual advance.
- King of the Table queue/current king/streak/spectator/host reset flow.
- Dedicated admin key login and role-gated admin screen.
- Dedicated settings screen.

## Phase 1 Findings

- The hosted web app is a single-page app with CSS/data-attribute screen switching rather than filesystem routes.
- Public screens are `Home`, `Table`, and `Play`; several requested roadmap screens are currently preview panels or not present.
- The live web app and iOS wrappers are split across multiple folders. The live web source is not the same folder as the EAS candidate.
- The old Spades README was stale and has been updated to match the current app.

## Phase 2 Baseline Verification

- Hosted health reports `publicApiUrl=https://1v1spades.com`.
- Hosted health reports `publicWebSocketUrl=wss://1v1spades.com/ws`.
- Hosted smoke passed create room, join room, WebSocket, one trick, full hand, reconnect, quick match, and hidden-hand safety.
- Spades app tests passed.
- Spades core rules tests passed.
- Shared game-shell tests passed.
- Capacitor iOS wrapper tests passed.

## Release Risk Notes

- App Store/TestFlight risk remains medium until the exact wrapper path is selected and built from one clean source of truth.
- Accounts, durable leaderboards, tournaments, KOTT, and admin roles are not complete production features yet.
- AFK/turn timer behavior is still documented as a placeholder in beta docs.
- The Downloads EAS project has pre-existing uncommitted changes and should not be overwritten blindly.
