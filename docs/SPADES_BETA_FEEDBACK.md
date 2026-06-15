# Spades Beta Feedback Reporting

This hosted beta is free play only. Keep issue reports focused on room entry, reconnect, Find Match, bidding, hand play, and diagnostics.

## What Testers Should Send

Use the Beta Feedback Report panel in the app and include:
- Issue summary: what broke or felt confusing.
- Steps to reproduce: what you tapped before it happened.
- Expected result: what you thought should happen.
- Actual result: what happened instead.
- Screenshot of the Beta Safety Checklist or the table state if helpful.
- Copyable diagnostics bundle from the QA panel.

The diagnostics bundle should include:
- room code
- phase
- transport mode
- seat
- current turn
- last action
- last error
- hidden-hand safety status
- server status
- WebSocket status
- recent public actions

The diagnostics bundle intentionally avoids hidden card details. It may include visible hand counts, public score, public bids, public bags, current trick count, and last trick winner.

## How To Capture A Report

1. Reproduce the issue if possible.
2. Open the Beta Feedback Report panel.
3. Tap Refresh Diagnostics.
4. Fill in Issue summary, Steps to reproduce, Expected, and Actual.
5. Tap Copy Diagnostics and paste the text into the bug report.
6. Tap Save Local Report to keep a local copy on the tester device.
7. Tap Export Saved Reports if multiple local reports should be sent together.

## Reset If Stuck

1. Try Restore Active Room.
2. Copy diagnostics before clearing anything.
3. Use Clear Active Room.
4. Refresh the page.
5. Re-enter the display name.
6. Create or join a fresh room.

## Good Bug Report Example

Issue summary:
Ready button did not move the room to bidding.

Steps:
Created room, second tester joined, player1 tapped Ready, player2 tapped Ready.

Expected:
Room should deal cards and enter bidding.

Actual:
Both testers still saw waiting phase.

Diagnostics:
Paste the generated "Send this to dev" summary from the Beta Feedback Report panel.
