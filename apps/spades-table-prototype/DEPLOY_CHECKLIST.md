# Spades Hosted Multiplayer Prototype Checklist

This is for external beta smoke testing only. It is free play. It is not a production account, payment, prize, gambling, tournament payout, or App Store build.

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

The server health response echoes the public API/WebSocket URLs only. It does not log hidden cards, room hands, player secrets, or request bodies.

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
9. Remind testers this is free play only with no cash prizes, no gambling, no payments, and no tournament payouts.

## External Tester Hardening Checks

1. Confirm the connection status panel is visible before creating a room.
2. Confirm reconnect help explains Restore Active Room.
3. Confirm the AFK/disconnect warning placeholder is visible.
4. Confirm Copy Room Code works after creating or joining a room.
5. Confirm Leave Room / Back to Lobby wording appears in table and text controls.
6. Confirm the Report Bug button remains visible while scrolling.
7. Trigger failed join, room full, stale action, and disconnected states when possible and verify friendly tester messages.

## Rollback Notes

- Roll back to the previous hosted release from the provider dashboard.
- Clear any in-memory rooms by restarting the service.
- No database migration is needed because this prototype stores no production data.
- If WebSocket smoke tests fail, switch testers back to direct local or mock live-sync mode and collect the action/error text from the beta safety panel.
