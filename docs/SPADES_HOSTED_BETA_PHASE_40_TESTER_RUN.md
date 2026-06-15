# Spades Hosted Beta Phase 40 Tester Run

Build: `Spades Hosted Beta v0.1.0 Launch Candidate / Phase 40`

This run is free play only.

## Final Hosted Beta Smoke Checklist

- Health endpoint returns `ok: true`.
- Hosted app loads the Phase 40 build label.
- `SPADES_PUBLIC_API_URL` points to the hosted API origin.
- `SPADES_PUBLIC_WS_URL` points to the hosted `/ws` endpoint.
- Create Room returns a room code.
- Join Room works from a second browser or device.
- Find Match pairs two testers into player1 and player2.
- Ready, bid, and play one full trick.
- Complete one hand.
- Refresh one tester and restore the same seat.
- Spectator view shows public status only.
- Bug report diagnostics can be copied.
- Hidden hands, private seat tokens, admin keys, and host-only data do not appear in UI, diagnostics, health responses, or API responses.

## Exact Deploy And Test Steps

1. Deploy `apps/spades-table-prototype`.
2. Set `SPADES_PUBLIC_API_URL` to the hosted API origin.
3. Set `SPADES_PUBLIC_WS_URL` to the hosted `/ws` endpoint.
4. Start the service with `npm start`.
5. Open `<hosted-url>/health` and confirm `ok: true`.
6. Run:

```sh
cd apps/spades-table-prototype
npm run smoke:hosted -- <hosted-url>
```

7. Open the hosted app in tester A's browser.
8. Enter a display name and create a room.
9. Copy the room code.
10. Open the hosted app in tester B's browser or device.
11. Enter a display name and join with the room code.
12. Ready both testers.
13. Bid from both seats.
14. Play at least one full trick.
15. Complete one hand if time allows.
16. Refresh tester A and tap Restore Active Room.
17. Confirm tester A returns to the same seat.
18. Run Find Match with two fresh tester identities.
19. Copy diagnostics from Report Bug.
20. Record results in the post-test review template below.

## What To Test First

1. Create Room.
2. Join Room by code.
3. Copy Room Code.
4. Ready both players.
5. Bid from both seats.
6. Play one trick.
7. Restore Active Room after refresh.
8. Find Match with two testers.
9. Spectator view in a full room.
10. Report Bug diagnostics.

## Tester Invite Message

Hi! The Spades free-play hosted beta is ready for a small first tester run.

Please test room entry, joining by code, Find Match, bidding, playing a hand, reconnect after refresh, and Report Bug diagnostics.

Start here:
1. Open the beta link.
2. Enter a display name.
3. Create a room or join with a room code.
4. Ready both seats, bid, and play one trick.
5. Refresh once and use Restore Active Room.
6. Tap Report Bug if anything is confusing or broken.

Please include the diagnostics bundle with any report.

## Bug Report Instructions

Ask testers to send:

- Short issue title.
- What they were trying to do.
- Steps to reproduce.
- Expected result.
- Actual result.
- Room code, if visible.
- Current phase.
- Current transport mode.
- Current seat.
- Last action.
- Last error.
- Hidden-hand safety status.
- Connection status.
- Screenshot or screen recording if useful.
- Copyable diagnostics bundle.

## Release Notes

- Phase 40 is a tester-run preparation pass.
- No gameplay features were added.
- The app remains local identity plus hosted room flow.
- Room code join, Find Match, reconnect, text-backed card controls, report diagnostics, and safety checks are the focus.
- Release handoff docs now include tester invite copy, bug report instructions, smoke steps, rollback, known issues, and post-test review.

## Known Issues

- Visual polish is still beta-level.
- Final custom card art is not included.
- AFK timing is a placeholder.
- Rooms are in memory and reset when the hosted service restarts.
- Local stats and history previews are local-only.
- Refresh recovery depends on the same local browser identity.
- A full match can take longer than the first tester session needs.

## Post-Test Review Template

Date:

Hosted URL:

Build label:

Tester count:

Smoke result:

Create Room result:

Join Room result:

Find Match result:

Reconnect result:

Hand play result:

Hidden-hand safety result:

Top tester confusion:

Top bug reports:

Must-fix before wider beta:

Nice-to-have before wider beta:

Decision:

## Rollback Instructions

1. Pause the tester run.
2. Roll back to the previous hosted release in the provider dashboard.
3. Restore previous public API and WebSocket URL settings if they changed.
4. Restart the service to clear in-memory rooms.
5. Re-run the hosted smoke test.
6. Send testers a short pause or resume note.

