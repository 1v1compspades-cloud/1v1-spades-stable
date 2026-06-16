# Spades Production Readiness Audit

Date: 2026-06-16

Scope: `apps/spades-table-prototype/**`, `packages/spades-core/**`, Spades docs, and the existing Expo/TestFlight wrapper handoff notes. This audit intentionally does not cover Euchre implementation work.

## Current Release Target

1V1 Competitive Spades is currently a free-play hosted web app used by the iOS/TestFlight wrapper. The production URL is `https://1v1spades.com` with WebSocket traffic at `wss://1v1spades.com/ws`.

The present app is best described as a working free-play beta, not a complete production platform. Core Spades gameplay and hosted multiplayer smoke paths are covered by tests. Accounts, production leaderboards, tournaments, King of the Table, and host/admin operations are still prototype or planning-level unless noted below.

## Screen And Route Inventory

The Spades beta is currently a single HTML shell, not a multi-route application. Screen routing is client-side state inside `apps/spades-table-prototype/src/home-client.js`.

Implemented player-facing screens and states:

- Home / lobby entry: `index.html` `.home-panel`, `#tester-entry-panel`, `#create-room`, `#join-room`, `#join-quick-match`, `#restore-room`.
- Waiting / invite flow: `#room-invite-panel`, `#global-room-invite-bar`, invite/share/copy controls, ready guidance.
- Gameplay screen: `index.html` `.status-panel`, `.visual-shell`, `#visual-hand`, bid controls, ready/leave/rematch controls.
- Spectator view: supported by room state sanitization and explicit `#spectate-room` entry; spectator sees public state and no hand.
- Reconnect view: local identity/session restore through `#restore-room` and server/client reconnect flows.
- Results / hand complete / match complete: represented in the same gameplay shell with hand summary, match history, next-hand/rematch controls gated by phase.
- Report Bug / diagnostics: `#jump-to-bug-report`, `.beta-feedback-panel`, diagnostics bundle, saved local reports.
- Developer/manual QA panels: advanced diagnostics, local preview tools, and manual harness details are present in markup but hidden from normal tester mode by CSS.

Not implemented as production routes/screens:

- Real account login/signup/profile pages.
- Production leaderboard page.
- Production tournament lobby/bracket/admin routes.
- King of the Table route.
- Host tools route with real server-validated admin roles.
- Settings route beyond existing prototype controls.

## Component And Module Inventory

Core gameplay package:

- `packages/spades-core/src/deck.js`: deck construction and ordering helpers.
- `packages/spades-core/src/bidding.js`: bid validation/turn rules.
- `packages/spades-core/src/legal-play.js`: follow-suit and spades-breaking legal play rules.
- `packages/spades-core/src/trick-winner.js`: trick winner resolution.
- `packages/spades-core/src/scoring.js`: bid, nil, bag, and hand scoring.
- `packages/spades-core/src/match-complete.js`: match completion checks.

Hosted app/runtime modules:

- `src/room-state.js`: room lifecycle, ready, deal, bidding, play, hand complete, match complete, rematch, sanitization.
- `src/server-boundary.js`: server action request/response boundary and stale/duplicate action protection.
- `src/http-server.js`: HTTP API, health endpoint, static app serving, local account preview endpoints.
- `src/websocket-server.js`: WebSocket subscriptions, room updates, queue broadcasts, reconnect snapshots.
- `src/server-client.js`: browser HTTP/WebSocket client.
- `src/quick-match.js`: in-memory quick match queue.
- `src/app-controller.js`: local/browser controller for create/join/ready/bid/play/reconnect.
- `src/local-identity.js` and `src/local-room-session.js`: local browser identity and session recovery.
- `src/visual-shell.js`: sanitized view model for cards, player panels, trick display, and QA checks.
- `src/home-client.js`: player UI state, guide copy, universal Home/Reconnect, invite/share/copy, bug reporting, bid/play actions.
- `src/local-account-stats.js`: local-only stats and leaderboard preview.
- `src/local-tournament-history.js`: local-only tournament history preview.
- `src/manual-harness.js` and `src/visual-qa-scripts.js`: manual QA fixtures and scripted visual checks.

## Phase Status

### Phase 1 - Audit

Status: in progress, this document is the first authoritative pass.

Evidence gathered:

- File inventory from `apps/spades-table-prototype/**` and `packages/spades-core/**`.
- Screen/control inventory from `apps/spades-table-prototype/index.html`.
- Test inventory from `apps/spades-table-prototype/tests/**` and `packages/spades-core/tests/**`.

Remaining audit work:

- Capture iOS wrapper config and EAS/TestFlight state in the same readiness tracker.
- Keep `docs/SPADES_RELEASE_GATE_MATRIX.md` current after every hosted deploy, TestFlight build, and real-device smoke pass.

### Phase 2 - Broken Basics

Status: partially complete for beta.

Completed or covered:

- Hosted health endpoint reports production public API/WebSocket URLs.
- Hosted smoke covers create, join, WebSocket, one trick, full hand, reconnect, quick match, and hidden-hand safety.
- Bottom Home/Table/Play tabs were removed; universal Home now returns to a clean Home screen with Reconnect to Current Game.
- Tester mode hides developer transport/debug panels by CSS in the current shell.

Known gaps:

- Developer/manual/local preview markup still exists in the shipped HTML and relies on hiding rather than separate build-time removal.
- There is no production visual regression suite for iPhone Safari/TestFlight layout.
- `apps/spades-table-prototype/node_modules/` is present as an untracked local directory and should not be committed.

### Phase 3 - Core Gameplay

Status: strong for current free-play rules.

Covered by tests:

- Deal/deck integrity.
- Bidding turn order and invalid bid rejection.
- Nil scoring.
- Spades broken/legal play/follow-suit enforcement.
- Trick winner.
- Bags and scoring.
- Hand complete and match complete.
- Last trick summary.
- Hidden-hand sanitization.

Known gaps:

- Timer behavior is still beta-level and not a production auto-forfeit system.
- There is no production dispute/review flow for weird edge reports from live testers.

### Phase 4 - Multiplayer Reliability

Status: beta-ready, not hardened platform-ready.

Covered by tests:

- HTTP and WebSocket create/join/ready/bid/play flows.
- Duplicate/stale action idempotency.
- Reconnect snapshot restore.
- Spectator public view safety.
- Quick Match pairing and queue leave.

Known gaps:

- Stale room cleanup is in-memory/runtime-bound and not a durable production room lifecycle.
- Duplicate tabs are guarded by identity/action rules, but there is no product UI explaining multi-tab conflicts.
- Phone plus desktop live testing still needs repeated real-device runs after every mobile UI pass.

### Phase 5 - Tournaments

Status: not production implemented.

Current state:

- Local tournament history preview exists.
- No production 4/8/16/32 bracket engine, assignment flow, champion screen, host tools, force forfeit, mark winner, remake room, validate bracket, or manual advance flow is implemented for Spades.

### Phase 6 - King of the Table

Status: not implemented.

Current state:

- No production queue, challenger invites, current king, streak counter, spectator mode, reset, or host controls specific to KOTT are present.

### Phase 7 - UI Polish

Status: active beta work.

Completed or partially complete:

- Onyx/gold theme and card/table styling exist in CSS.
- Mobile-first clean Home/Reconnect navigation is implemented.
- Card hands are sorted by suit with Spades first in visual model tests.

Known gaps:

- Luxury diamond theme is not yet verified screen-by-screen across every state.
- iPhone 15 screenshots remain the authority for layout polish; automated pixel/layout checks are not yet present.
- Some prototype/developer structures still shape layout complexity even when hidden.

### Phase 8 - Accounts

Status: prototype/local-only.

Current state:

- Guest identity/display name exists.
- Local stats and leaderboard preview exist.
- No real login/signup, production account database, profile route, durable wins/losses, match history, tournament history, KOTT streak history, admin roles, or production leaderboard-ready backend data model exists.

### Phase 9 - Release Prep

Status: TestFlight beta path has been exercised, production platform prep incomplete.

Completed or covered:

- Production URL and WebSocket URL are configured through hosted health.
- EAS/TestFlight build handoff has been completed for build 19 in the Expo wrapper project.
- Hosted smoke currently passes against `https://1v1spades.com`.

Known gaps:

- App Store screenshots, privacy answers, and final external tester checklist still need a maintained release packet.
- Production accounts/leaderboards/tournaments/KOTT should not be advertised as live until implemented.
- The current release should remain positioned as free-play beta.

## Immediate Next Best Work

1. Verify the live `/privacy`, `/terms`, and `/support` routes after deploy.
2. Add an automated UI-state smoke for the clean Home/Reconnect flow if a browser test harness is introduced.
3. Keep production claims narrow: free-play rooms, Find Match, reconnect, spectator safety, and core gameplay.
4. Do not start KOTT or tournament implementation until the beta release gate is stable and documented.

## Verification Snapshot

Most recent verified commands before this audit:

- `npm test` in `apps/spades-table-prototype`: 153 passing tests.
- Hosted smoke against `https://1v1spades.com`: passed health, create room, join room, WebSocket, one trick, complete hand, reconnect, quick match, and hidden-hand safety.

This audit is documentation-only and does not change gameplay, scoring, bidding, trick logic, server rules, or Euchre files.
