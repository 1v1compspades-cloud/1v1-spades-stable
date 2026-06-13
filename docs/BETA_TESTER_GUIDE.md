# Spades Hosted Beta Tester Guide

Welcome to the Spades hosted beta. This build is for testing room entry, reconnect, Quick Match, bidding, hand play, and issue reporting.

Safety note: this beta is free play only.

## Before You Start

1. Open the hosted beta link.
2. Confirm the visible build label at the top of the page.
3. Enter a display name for this device.
4. Use the Real Local Server transport when testing hosted multiplayer.

## Quick Checklist

- Create room.
- Join room.
- Quick Match.
- Bid.
- Play hand.
- Reconnect.
- Report bug.

## How To Test

Create room:
1. Enter a display name.
2. Tap Create Room.
3. Share the room code with another tester.

Join room:
1. Enter a display name on another browser or device.
2. Enter the room code.
3. Tap Join Room.

Quick Match:
1. Use two tester identities.
2. Tap Join Quick Match from both testers.
3. Confirm one tester becomes player1 and the other becomes player2.

Bid and play:
1. Ready both players.
2. Submit bids for both players.
3. Play cards until at least one full hand completes.
4. Confirm the score, bids, bags, current trick, and last trick look reasonable.

Reconnect:
1. Refresh the page during a room.
2. Tap Restore Active Room.
3. Confirm the same seat returns.
4. Confirm hidden-hand safety still passes.

Report bug:
1. Open the Beta Feedback Report panel.
2. Fill in issue summary, steps, expected result, and actual result.
3. Tap Refresh Diagnostics.
4. Tap Copy Diagnostics.
5. Send the copied "Send this to dev" summary with screenshots if helpful.

## What To Include In A Bug Report

- Room code.
- Phase.
- Transport mode.
- Seat.
- Last action.
- Last error.
- Hidden-hand safety status.
- Screenshot of the confusing state.
- The copied diagnostics bundle.

## Known Limits

- No real accounts database.
- Leaderboard and tournament panels are local previews only.
