# Spades Release Gate Matrix

Date: 2026-06-16

Scope: free-play Spades hosted web beta and the Spades Free Play iOS/TestFlight wrapper. This matrix tracks beta release gates only. It does not mark production accounts, production leaderboards, tournaments, or King of the Table as complete.

Status key:

- PASS: current automated or config evidence is enough for the beta gate.
- MANUAL: must be checked on a real iPhone/TestFlight or provider dashboard.
- RISK: acceptable for a limited beta only if communicated clearly.
- BLOCKER: must be fixed before App Store/TestFlight external use or before marketing the feature.

## Required Commands

Run these from `/Users/Shaw/Documents/euchre-github` unless noted.

```sh
cd apps/spades-table-prototype
npm test
npm run smoke:hosted -- https://1v1spades.com
curl -fsSL https://1v1spades.com/health
curl -I https://1v1spades.com/privacy
curl -I https://1v1spades.com/terms
curl -I https://1v1spades.com/support
```

For core rules:

```sh
corepack pnpm --filter @spades-master/spades-core run test
```

For the iOS wrapper:

```sh
cd /Users/Shaw/Downloads/spades-project/artifacts/spades-freeplay
corepack pnpm --filter @workspace/spades-freeplay run typecheck
corepack pnpm --filter @workspace/spades-freeplay exec eas config --platform ios --profile production
corepack pnpm --filter @workspace/spades-freeplay exec eas build:list --platform ios --limit 3
```

## Hosted Web Gates

| Gate | Status | Evidence | Verification | Next action |
| --- | --- | --- | --- | --- |
| Production URL is correct | PASS | `/health` returns `publicApiUrl: https://1v1spades.com` and `publicWebSocketUrl: wss://1v1spades.com/ws`. | `curl -fsSL https://1v1spades.com/health` | Recheck after every deploy. |
| WebSocket and hosted smoke path work | PASS | Hosted smoke covers health, public URL config, app shell, clean Home/Reconnect shell, public pages, free-play copy, create room, join room, WebSocket, one trick, complete hand, reconnect, quick match, and hidden-hand safety. | `npm run smoke:hosted -- https://1v1spades.com` | Re-run after every code or Render env change. |
| Public legal/support URLs resolve | PASS | Live `/privacy`, `/terms`, and `/support` return HTTP 200 with free-play-only wording. | `curl -I https://1v1spades.com/privacy`, `/terms`, `/support`. | Recheck before App Store metadata review. |
| Root web app loads | PASS | `/` serves the Spades app shell with universal Home, Reconnect to Current Game, create/join/find match actions, Report Bug, and no bottom Home/Table/Play tabs. | Hosted smoke plus manual browser load. | Recheck after deploy. |
| Free-play wording | PASS | Home, policy pages, terms, and launch docs say free play only. | Read root shell plus public pages. | Keep payments/prizes/gambling language out of product UI. |
| Hidden hands stay private | PASS | Core, room-state, HTTP, WebSocket, visual shell, hosted smoke, and spectator tests cover hidden-hand safety. | `npm test`; hosted smoke. | Add browser visual checks later. |
| Report Bug remains available | PASS with manual confirmation | `#jump-to-bug-report` and beta feedback diagnostics exist and are tested as shell targets. | `npm test`; manual phone check. | Confirm it never covers key gameplay buttons on iPhone. |
| Developer panels hidden from testers | RISK | CSS/tester mode hides advanced diagnostics/local preview/manual tools; markup still ships. | `npm test`; manual phone check. | Prefer build-time removal or a production shell split before broad launch. |
| Logs do not leak secrets | MANUAL | Code tests cover diagnostics/API payloads, not Render log review. | Inspect Render logs during create/join/bid/play smoke. | Confirm no hands, seat tokens, request bodies, admin keys, or secrets appear. |
| Rollback path exists | MANUAL | Docs describe rollback; actual proof lives in provider dashboard. | Confirm previous Render deploy is available and can be redeployed. | Keep tester pause/update message ready. |

## iOS/TestFlight Gates

| Gate | Status | Evidence | Verification | Next action |
| --- | --- | --- | --- | --- |
| Correct Expo app folder | PASS | `/Users/Shaw/Downloads/spades-project/artifacts/spades-freeplay`. | `pwd`; inspect `app.json`. | Keep future EAS work in this folder. |
| App identity | PASS | `app.json` name `Spades Free Play`, bundle ID `com.oneononespades.freeplay`, version `1.0.0`, iOS buildNumber `19`. | `cat app.json`. | Increment buildNumber before every new upload. |
| Production wrapper URL | PASS | `app/index.tsx` and `expo-router` origin point to `https://1v1spades.com/`; production env has `EXPO_PUBLIC_DOMAIN=1v1spades.com`. | `rg "1v1spades|EXPO_PUBLIC_DOMAIN"`. | Recheck before each EAS build. |
| EAS production config | PASS | `eas.json` production profile has `autoIncrement: false`, `EXPO_PUBLIC_DOMAIN=1v1spades.com`, ASC app ID `6776721716`. | `eas config --platform ios --profile production`. | Keep Apple team/account credentials ready. |
| Latest build submitted | PASS, reverify before next beta | Build 19 was submitted to App Store Connect/TestFlight earlier in this release track. | `eas build:list --platform ios --limit 3`; App Store Connect TestFlight processing page. | Re-run before inviting testers to a new build. |
| iPhone install and launch | MANUAL | Requires real TestFlight device. | Install latest build, open on iPhone, confirm no crash and hosted app loads. | Must be repeated after every hosted UI change because the wrapper loads the live site. |
| iPhone clean Home/Reconnect | MANUAL plus automated state coverage | `tests/player-ui-navigation.test.js` covers in-room, clean Home, active-game Home, and saved-session Reconnect states; real iPhone must confirm visual flow. | `npm test`; then create room, tap Home, confirm clean Home, tap Reconnect, confirm room returns. | Required before external tester invite. |
| iPhone gameplay fit | MANUAL | Automated unit tests do not prove visual fit on iPhone 15 Safari/TestFlight. | Play create/join/ready/bid/play/full hand on iPhone. | Screenshot each major phase. |
| App Store public URLs | PASS | `/privacy`, `/terms`, and `/support` are live HTTP 200 routes. | `curl -I` for all three before each submission. | Keep wording current as privacy/support behavior changes. |

## Gameplay Gates

| Gate | Status | Evidence | Verification | Next action |
| --- | --- | --- | --- | --- |
| Deck and deal integrity | PASS | `packages/spades-core/tests/deck.test.js`; app room-state tests. | Core test command and `npm test`. | Keep deck tests updated if variant changes. |
| Bidding and nil | PASS | Core bidding/nil tests plus app controller tests. | Core test command and `npm test`. | No rule changes without tests first. |
| Legal play and spades broken | PASS | Core legal-play tests and app play-card tests. | Core test command and `npm test`. | Real-device gameplay smoke still required. |
| Trick winner and scoring | PASS | Core trick/scoring/bags/match-complete tests and full-hand app tests. | Core test command and `npm test`. | Add regression tests for any tester-reported scoring bug. |
| Hand complete and match complete controls | PASS | App controller and shell visibility tests cover next-hand/new-match/rematch gating. | `npm test`. | Manual phone check at hand end and match end. |
| Timer/auto-forfeit | RISK | Countdown exists for ready/coin flip; production auto-forfeit is not complete. | Current tests cover ready countdown metadata/flow only where present. | Do not market auto-forfeit/tournament timer behavior yet. |

## Multiplayer Gates

| Gate | Status | Evidence | Verification | Next action |
| --- | --- | --- | --- | --- |
| Room create/join | PASS | HTTP, app controller, hosted smoke. | `npm test`; hosted smoke. | Manual two-phone check. |
| Quick Match | PASS | Quick match unit tests, HTTP tests, hosted smoke. | `npm test`; hosted smoke. | Manual two-device Find Match check. |
| Reconnect | PASS for beta | Local session, server client, WebSocket, hosted smoke, and shell Home/Reconnect tests. | `npm test`; hosted smoke. | Manual refresh/reconnect on iPhone. |
| Spectator safety | PASS | Room-state, app controller, WebSocket, visual QA tests cover spectator no-hand view. | `npm test`. | Manual third-device spectator check. |
| Duplicate tabs/actions | PASS for action safety, UX risk | Duplicate/stale action tests pass; product UI does not explain multi-tab conflict. | `npm test`. | Add user-facing duplicate-tab guidance later. |
| Stale room cleanup | RISK | Rooms are in memory for beta; restart clears them. | Provider restart/manual. | Add durable lifecycle cleanup before production platform launch. |

## Feature Scope Gates

| Feature | Status | Evidence | Release rule |
| --- | --- | --- | --- |
| Guest mode | PASS | Local identity/display name/session tests. | Safe for beta. |
| Production accounts | BLOCKER for account launch | Audit shows no real login/signup/profile/database. | Do not market accounts as live. |
| Production leaderboard | BLOCKER for leaderboard launch | Only local/server-preview leaderboard exists. | Do not market top-tier leaderboard yet. |
| Tournaments | BLOCKER for tournament launch | Only local tournament history preview exists. No bracket/admin engine. | Do not market tournaments as live. |
| King of the Table | BLOCKER for KOTT launch | No KOTT queue/current king/streak/host controls implemented. | Do not market KOTT as live. |
| Admin roles/tools | BLOCKER for admin launch | No production admin auth/role system. | Keep admin claims out of public copy. |

## Manual iPhone/TestFlight Checklist

Run this on iPhone 15 or newer and capture screenshots:

1. Install latest TestFlight build.
2. Launch with normal network; confirm no crash and app loads `1v1spades.com`.
3. Confirm Home shows create/join/find match and no table/invite/trick panels.
4. Create room, copy room code, and invite/share link.
5. Tap Home; confirm clean Home plus Reconnect to Current Game.
6. Tap Reconnect; confirm the same room returns.
7. Join from second device; confirm both players see the correct state.
8. Ready both players; confirm coin flip/countdown starts only after both ready.
9. Bid both players; confirm only the active player can bid.
10. Play one trick and one full hand; confirm legal-play enforcement and scoring.
11. Refresh or background/foreground one device; confirm reconnect restores the same seat.
12. Join third device as spectator; confirm no hidden hands.
13. Try Find Match with two devices.
14. Use Report Bug; confirm diagnostics copy and no hidden cards/private tokens.
15. Open `/privacy`, `/terms`, and `/support` in Safari; confirm all resolve.

## Release Decision

Current decision: limited free-play beta can continue after real-device checks pass. Full production readiness is not complete because accounts, production leaderboards, tournaments, KOTT, host/admin tools, durable room lifecycle, and iPhone visual regression coverage remain unfinished.
