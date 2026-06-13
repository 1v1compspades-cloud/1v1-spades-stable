# Spades Hosted Beta Release Notes

Build: `Spades Hosted Beta v0.1.0 Launch Candidate / Phase 40`

This beta is free play only.

## What Is Included

- Hosted room-code flow for creating and joining 1v1 Spades rooms.
- Local identity restore for reconnecting to the same seat.
- Quick Match queue for pairing two testers.
- HTTP and WebSocket local server boundary with sanitized responses.
- Simple mobile-first table layout using text-backed card buttons.
- Bidding, legal play, trick resolution, hand completion, next hand, match completion, and new match reset.
- Beta safety panel, diagnostics bundle, issue report form, and tester-friendly error messages.
- Hosted smoke-test script for health, room join, WebSocket, reconnect, Quick Match, and hidden-hand safety.

## Safety Confirmations

- Player1 sees only player1 hand.
- Player2 sees only player2 hand.
- Spectator sees no hidden hands.
- Current trick, last trick, scores, bids, bags, phase, turn, and room code are public.
- UI and diagnostics should not expose hidden hands, private seat tokens, admin keys, secrets, or host-only data.
- Server logs should not include hidden hands, private seat tokens, request bodies, admin keys, or secrets.

## Known Issues

- Visual polish is still beta-level.
- Final custom card art and animations are not included.
- AFK/disconnect timing is a placeholder.
- Rooms are stored in memory for the prototype and reset when the server restarts.
- Local stats, leaderboard preview, and tournament history preview are local-only.
- There is no real login or production database.

## Smoke Test

```sh
cd apps/spades-table-prototype
npm run smoke:hosted -- https://spades-beta.example.com
```

The smoke test validates health, create room, join room, WebSocket connection, one trick, hand completion, reconnect, Quick Match, and hidden-hand safety.

## Rollback

- Pause tester invites.
- Roll back to the previous hosted release.
- Restore previous public API/WebSocket environment variables if they changed.
- Restart the service to clear in-memory rooms.
- Re-run the hosted smoke test before sending testers back in.
