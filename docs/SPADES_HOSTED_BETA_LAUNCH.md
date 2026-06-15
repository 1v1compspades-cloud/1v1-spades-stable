# Spades Hosted Beta Launch Flow

This beta is free play only. It has no production account system. Leaderboard and tournament panels are local previews for architecture testing only.

## Tester Entry Flow

1. Open the hosted Spades prototype.
2. Enter a display name for this device.
3. Create a room and share the room code with a second tester.
4. Join a room by code from a second browser/device.
5. Use Find Match when two testers want the server to pair them automatically.
6. Use Restore Active Room after refresh or reconnect.
7. Use Clear Active Room if a local tester session gets stuck.

## Beta Invite Checklist

Ask testers to try:
- Create a room and share the code.
- Join a room by code.
- Ready both seats, bid both seats, play a full trick, and complete a hand.
- Refresh during bidding or play and confirm reconnect restores the same seat.
- Use Find Match with two testers.
- Join as a third viewer and confirm spectator mode shows no hidden hands.
- Leave and rejoin safely.

Ask testers to report:
- Screenshot of the beta safety checklist panel.
- Screenshot of the action log around the issue.
- Room code, selected transport mode, current phase, viewer seat, last action, and last error.
- The copyable diagnostics bundle from the Beta Feedback Report panel.
- Whether the issue happened after refresh, reconnect, Find Match, or manual room-code join.

Known limitations:
- No real login or production account database.
- No production leaderboard.
- Local stats, leaderboard preview, and tournament history prep are prototype-only.
- Free-play tester build only.
- Visual card art and final animations are not included yet.

Reset if stuck:
- Try Restore Active Room first.
- Use Clear Active Room to drop the local session.
- Refresh the page and re-enter the display name.
- If testing a hosted build, restart the hosted service to clear all in-memory rooms.

## Server Smoke-Test Checklist

Run the scripted check when possible:

```sh
cd apps/spades-table-prototype
npm run smoke:hosted -- https://spades-beta.example.com
```

Manual smoke path:
1. Open `/health` and confirm `ok: true`.
2. Create a room.
3. Join the room with a second tester by room code.
4. Confirm WebSocket status is connected.
5. Ready both players and submit both bids.
6. Play one full trick.
7. Complete one hand.
8. Reconnect one tester and confirm the same seat returns.
9. Use Find Match with two testers.
10. Confirm player1, player2, and spectator views do not leak hidden hands.

## Feedback Capture

The app includes a local-only Beta Feedback Report panel. Testers should fill in the issue summary, steps, expected result, and actual result, then copy the diagnostics bundle. The diagnostics include room code, phase, transport, seat, last action, last error, and hidden-hand safety status without including hidden card details.

Saved beta reports remain local to the tester device until exported or cleared.

## Safety Wording

Use this language in beta invites:

> This is a free-play Spades beta for testing room flow, reconnect, Find Match, and gameplay reliability. Local leaderboard and tournament panels are previews only.
