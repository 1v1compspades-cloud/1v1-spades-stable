# Spades Hosted Multiplayer Prototype Checklist

This is for external beta smoke testing only. It is a free-play tester build, not a production account or App Store build.

Related launch docs:
- `docs/PRODUCTION_CONFIG_CHECKLIST.md`
- `docs/BETA_TESTER_INVITE.md`
- `docs/SPADES_BETA_RELEASE_NOTES.md`
- `docs/SPADES_HOSTED_BETA_PHASE_40_TESTER_RUN.md`
- `docs/FINAL_SMOKE_TEST_CHECKLIST.md`

## Local Run

```sh
cd apps/spades-table-prototype
npm install
npm start
```

Defaults:
- HTTP API: `http://127.0.0.1:5175`
- WebSocket: `ws://127.0.0.1:5175/ws`
- Health: `http://127.0.0.1:5175/health`

## Environment Variables

- `PORT`: server port supplied by the host. Falls back to `5175`.
- `SPADES_SERVER_PORT`: optional local server-port fallback.
- `SPADES_BIND_HOST`: optional bind host. Use `0.0.0.0` only when the host requires it.
- `SPADES_PUBLIC_API_URL`: hosted API origin, for example `https://spades-beta.example.com`.
- `SPADES_PUBLIC_WS_URL`: hosted WebSocket URL, for example `wss://spades-beta.example.com/ws`.
- `PUBLIC_API_URL`: optional fallback public API origin if the host already exposes it.
- `PUBLIC_WS_URL`: optional fallback public WebSocket endpoint if the host already exposes it.

The server health response echoes the public API/WebSocket URLs only. It does not log hidden cards, room hands, player secrets, or request bodies.

## Production Config Checklist

1. Confirm the hosted app serves the Phase 40 beta build label.
2. Confirm `SPADES_PUBLIC_API_URL` is an absolute `https://` URL for hosted beta.
3. Confirm `SPADES_PUBLIC_WS_URL` is an absolute `wss://` URL ending in `/ws` for hosted beta.
4. Confirm local fallback URLs use `http://127.0.0.1:<port>` and `ws://127.0.0.1:<port>/ws`.
5. Confirm the HTTPS API URL is never paired with an insecure `ws://` WebSocket URL.
6. Confirm no credentials, API keys, private seat tokens, or admin secrets are configured in public URL variables.
7. Confirm `/health` returns `ok: true` after deploy.
8. Confirm the hosted smoke script passes before inviting testers.

## Backend URL / WebSocket URL Validation

The smoke script validates public URLs before it runs:

- API URL must use `http://` or `https://`.
- WebSocket URL must use `ws://` or `wss://`.
- Hosted `https://` API requires a `wss://` WebSocket URL.
- Hosted WebSocket URL should end in `/ws`.

If validation fails, fix `SPADES_PUBLIC_API_URL` and `SPADES_PUBLIC_WS_URL`, restart the service, and rerun the smoke test.

## Render

- Build command: `npm install`
- Start command: `npm start`
- Root directory: `apps/spades-table-prototype`
- Set `PORT` from Render automatically.
- Set `SPADES_PUBLIC_API_URL` to the Render HTTPS service URL.
- Set `SPADES_PUBLIC_WS_URL` to the same host with `wss://` and `/ws`.

## Railway

- Root directory: `apps/spades-table-prototype`
- Start command: `npm start`
- Use Railway-provided `PORT`.
- Set `SPADES_PUBLIC_API_URL` and `SPADES_PUBLIC_WS_URL` after the first public domain is assigned.

## Fly

- Root directory: `apps/spades-table-prototype`
- Internal port should match `PORT`.
- Set `SPADES_PUBLIC_API_URL` to the Fly HTTPS app URL.
- Set `SPADES_PUBLIC_WS_URL` to the Fly WSS `/ws` URL.

## Hosted Smoke Test

Scripted check:

```sh
cd apps/spades-table-prototype
npm run smoke:hosted -- https://spades-beta.example.com
```

The script checks health, create room, join room, WebSocket connection, one trick, full hand completion, reconnect, Quick Match, and hidden-hand safety.

1. Open `/health` and confirm `ok: true`.
2. Create a room from tester A.
3. Join by room code from tester B.
4. Confirm both seats show only their own hands after ready/deal.
5. Connect a spectator and confirm no hand is visible.
6. Submit ready, bids, and play one full trick.
7. Complete a hand and confirm the summary appears.
8. Disconnect/reconnect one tester and confirm the same seat restores.
9. Use Quick Match with two testers and confirm player1/player2 assignment.
10. Confirm the beta safety panel shows hidden-hand safe.

## Tester Entry Steps

Use this sequence for each hosted beta invite:

1. Open the hosted URL and confirm the visible beta build label.
2. Enter a display name.
3. Create a room and share the room code with another tester.
4. Join a room by code from a second browser or device.
5. Try Quick Match with two testers.
6. Ready both players, bid, and play at least one hand.
7. Refresh during a room and use Restore Active Room to test reconnect.
8. Use the Beta Feedback Report panel to report a bug with diagnostics.
9. Remind testers this is free play only.

## External Tester Hardening Checks

1. Confirm the connection status panel is visible before creating a room.
2. Confirm reconnect help explains Restore Active Room.
3. Confirm the AFK/disconnect warning placeholder is visible.
4. Confirm Copy Room Code works after creating or joining a room.
5. Confirm Leave Room / Back to Lobby wording appears in table and text controls.
6. Confirm the Report Bug button remains visible while scrolling.
7. Trigger failed join, room full, stale action, and disconnected states when possible and verify friendly tester messages.

## Launch Candidate Final Smoke Test

1. Confirm the beta build label reads as a launch candidate.
2. Confirm all public text uses free-play wording only.
3. Confirm advanced diagnostics and local preview tools are collapsed by default.
4. Confirm the copyable diagnostics section remains visible for bug reports.
5. Confirm known issues are visible to testers.
6. Confirm hidden hands, private seat credentials, host-only data, and admin-only data are not visible in the public UI.
7. Confirm the mobile layout has no horizontal scrolling and the Report Bug button stays reachable.
8. Run the final smoke-test checklist in `docs/FINAL_SMOKE_TEST_CHECKLIST.md`.
9. Confirm release notes in `docs/SPADES_BETA_RELEASE_NOTES.md` match the deployed build.
10. Confirm tester invite copy in `docs/BETA_TESTER_INVITE.md` uses free-play wording only.
11. Run the Phase 40 tester-run checklist in `docs/SPADES_HOSTED_BETA_PHASE_40_TESTER_RUN.md`.

## API And UI Safety Confirmations

- UI does not show hidden hands.
- API responses do not include hidden opponent hands.
- Diagnostics do not include hidden hands, private seat tokens, admin keys, secrets, or host-only data.
- Event logs show sanitized action summaries only.
- Health responses expose only operational status and public URLs.
- Tester copy says free play only.

## Known Issues For Testers

- Visual polish is still beta-level.
- AFK/disconnect timing is a placeholder.
- Local stats and history previews are local-only.
- Refresh recovery depends on the same browser/device identity.
- No production account database exists yet.

## Rollback Notes

- Pause tester invites.
- Roll back to the previous hosted release from the provider dashboard.
- Restore the previous `SPADES_PUBLIC_API_URL` and `SPADES_PUBLIC_WS_URL` values if they changed.
- Clear any in-memory rooms by restarting the service.
- No database migration is needed because this prototype stores no production data.
- Re-run `npm run smoke:hosted -- <hosted-url>` after rollback.
- If WebSocket smoke tests fail, switch testers back to direct local or mock live-sync mode and collect the action/error text from the beta safety panel.
