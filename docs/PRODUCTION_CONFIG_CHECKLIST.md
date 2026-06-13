# Spades Hosted Beta Production Config Checklist

This checklist is for the free-play hosted beta only. It does not enable real login or a production account database.

## Production Config Checklist

- Deploy from `apps/spades-table-prototype`.
- Use `npm install` as the build command.
- Use `npm start` as the start command.
- Confirm the health endpoint returns `ok: true`.
- Confirm the hosted app loads the visible `Spades Hosted Beta v0.1.0 Launch Candidate / Phase 40` build label.
- Confirm WebSocket traffic is accepted by the host.
- Confirm server logs do not include hidden hands, private seat tokens, request bodies, admin keys, or secrets.
- Confirm tester-facing UI says free play only.

## Environment Variable Checklist

- `PORT`: host-provided HTTP port. Use the platform default when available.
- `SPADES_SERVER_PORT`: optional local fallback when `PORT` is not supplied.
- `SPADES_BIND_HOST`: optional bind host. Use `0.0.0.0` only when required by the hosting provider.
- `SPADES_PUBLIC_API_URL`: public HTTPS API origin, for example `https://spades-beta.example.com`.
- `SPADES_PUBLIC_WS_URL`: public WSS endpoint, for example `wss://spades-beta.example.com/ws`.
- `PUBLIC_API_URL`: legacy/fallback public API origin if the platform already provides it.
- `PUBLIC_WS_URL`: legacy/fallback public WebSocket URL if the platform already provides it.

Do not store credentials, API keys, admin tokens, or player secrets in these public URL variables.

## Backend URL / WebSocket URL Validation

- Hosted API URLs must be absolute `https://` URLs.
- Local API URLs may use `http://127.0.0.1:<port>` or `http://localhost:<port>`.
- Hosted WebSocket URLs must be absolute `wss://` URLs ending in `/ws`.
- Local WebSocket URLs may use `ws://127.0.0.1:<port>/ws` or `ws://localhost:<port>/ws`.
- If the API URL uses `https://`, the WebSocket URL must use `wss://`.
- The API and WebSocket URLs should point at the same public host unless the deploy intentionally splits them.
- The smoke script rejects invalid URL protocols before it runs tester flows.

## Deploy Smoke-Test Steps

Run the scripted smoke test after every deploy:

```sh
cd apps/spades-table-prototype
npm run smoke:hosted -- https://spades-beta.example.com
```

Manual fallback:

1. Open `/health` and confirm `ok: true`.
2. Create a room from tester A.
3. Join by room code from tester B.
4. Ready both players, bid, and play one full trick.
5. Complete one hand.
6. Refresh tester A and restore the active room.
7. Run Quick Match with two testers.
8. Confirm player1 sees only player1 hand.
9. Confirm player2 sees only player2 hand.
10. Confirm spectator sees no hidden hands.

## UI And API Safety Confirmations

- Public UI does not show hidden hands.
- API responses do not include hidden opponent hands.
- Diagnostics do not include hidden hands, private seat tokens, admin keys, secrets, or host-only data.
- Logs do not include card hands, private seat tokens, request bodies, admin keys, or secrets.
- Action/event logs show only public room status, public trick cards, phase, turn, and sanitized action results.

## Rollback Instructions

1. Pause tester invites.
2. Roll back to the previous hosted release in the provider dashboard.
3. Restore the previous `SPADES_PUBLIC_API_URL` and `SPADES_PUBLIC_WS_URL` values if they changed.
4. Restart the service to clear in-memory rooms.
5. Re-run the hosted smoke test.
6. Send testers the updated link or a short pause notice.
