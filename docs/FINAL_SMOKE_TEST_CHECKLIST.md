# Spades Launch Candidate Final Smoke-Test Checklist

This launch candidate is free play only. There are no cash prizes, no gambling, no payments, and no tournament payouts.

## Public Text Check

- The beta build label is visible and intentional.
- Public text says free play only.
- Public text does not advertise prizes, cash, gambling, payments, or payouts.
- Local previews are clearly described as local previews, not production rankings.

## Mobile Layout Check

- The welcome panel fits on a phone screen without horizontal scrolling.
- Create Room, Join Room, Quick Match, Restore Active Room, Copy Room Code, and Report Bug are easy to tap.
- The Report Bug button remains visible while scrolling.
- The diagnostics text area is readable and copyable.
- Advanced diagnostics and local test tools are collapsed by default.

## Multiplayer Smoke Path

1. Open `/health` and confirm `ok: true`.
2. Open the hosted app on tester A.
3. Enter a display name.
4. Create a room.
5. Copy/share the room code.
6. Join from tester B by room code.
7. Ready both players.
8. Bid from both seats.
9. Play one full hand.
10. Refresh one tester and restore the active room.
11. Confirm the same seat returns.
12. Confirm hidden-hand safety passes.
13. Try Quick Match with two testers.
14. Submit a bug report and copy diagnostics.

## Data Safety Check

- Player1 sees only player1 hand.
- Player2 sees only player2 hand.
- Spectator sees no hidden hands.
- Copyable diagnostics do not include hidden hands, private seat credentials, host-only data, or secrets.
- No admin-only data is visible in the tester UI.

## Known Issues

- Visual polish is still beta-level.
- AFK/disconnect timing is a placeholder.
- Local stats and history previews are local-only.
- Refresh recovery depends on the same browser/device identity.
- No production account database exists yet.
