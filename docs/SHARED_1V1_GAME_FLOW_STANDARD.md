# Shared 1V1 Game Flow Standard

This standard applies to future 1V1 games, including Spades, Euchre, Hearts, Bid Whist, Pitch, Pinochle, Gin/Rummy, and Cribbage.

## Purpose

All 1V1 games should use the same clear room flow:

Home settings -> pre-match lobby -> both players ready up -> 5-second countdown -> coin/start sequence when required -> gameplay -> round result countdown -> next round or winner.

The goal is to make every game feel familiar, predictable, spectator-safe, and easy to test.

## Standard Room Flow

1. The home screen always shows settings and rules first.
2. Player 1 creates the room from the home/settings screen.
3. The creator is sent to the pre-match lobby with a room code and invite link.
4. Player 2 joins by room link or room code.
5. A third visitor becomes a spectator.
6. The pre-match lobby shows player slots, ready status, match settings, and invite links.
7. No gameplay interface is shown in the pre-match lobby.
8. Both seated players must ready up.
9. A 5-second countdown starts after both players are ready.
10. After the countdown, the game runs its coin/start sequence when required.
11. Shuffle, deal, and game start happen only after the countdown and required start sequence complete.
12. After each hand or round, show score/result for 5 seconds.
13. The next hand or round starts automatically unless the match is complete.
14. Spectators never see hidden hands or private player-only state.
15. Admin or host tools are separate from player seats.
16. Games are free-play only by default.
17. Payment, wallet, deposit, or prize wording must not appear unless legal approval exists later.

## Home Settings Requirements

The home/settings screen should show:

- Player name
- Game mode
- Target score or match length
- Important rule toggles
- Short rules summary
- Create Room
- Join Room
- Rules

## Pre-Match Lobby Requirements

The pre-match lobby should show:

- Room code
- Copy invite link
- Copy spectator link, when available
- Match type or game mode
- Target score or match length
- Important rule toggles
- Short rules summary
- Player 1 slot
- Player 2 slot
- Ready status for both players
- Ready button for seated players only
- Spectator label for non-seated visitors

The pre-match lobby must not show:

- Player hands
- Opponent hidden-card area
- Deck/kitty/upcard/game-specific hidden resources
- Trick/play area
- Gameplay action controls

## Seat Assignment

Player seating should be deterministic and safe:

- The room creator becomes Player 1.
- The first different browser/session using the link or code becomes Player 2 if the seat is open.
- If both seats are taken, the visitor is shown spectator view.
- The same browser/session must not take both player seats.
- Reconnects should restore the same seat when the session identity is available.

## Gameplay Visibility

Before the countdown and required start sequence complete, do not show:

- Player hands
- Opponent hidden-card area
- Deck/kitty/upcard/game-specific hidden resources
- Trick/play area
- Action controls for gameplay

After the countdown and required start sequence complete, show the full game interface.

## Coin Or Start Sequence

Some games need a start sequence after both players are ready. Examples include a coin toss, first dealer choice, first lead choice, or opening crib/deal order.

When a start sequence is required:

- Run it only after both players are seated and ready.
- Show it as a focused modal or centered decision panel.
- Clearly identify the winner or chooser.
- Show choice buttons only to the player who may act.
- Hide choice buttons after the decision is saved.
- Start gameplay only after the required decision is complete.

## Countdown Rules

Countdown state should be stored in room/server state, not as a client-only timer.

Required fields may include:

- `phase`
- `playerReady`
- `countdownEndsAt`
- `coinFlipWinner` or equivalent start-sequence winner, when needed
- `firstDealer` or equivalent starting-position choice, when needed
- `nextRoundStartsAt`
- seated player session identifiers

Polling, reconnects, or refreshes must not duplicate countdowns.

## Round Transition

After a hand or round completes:

- Show the result and updated score.
- Display a 5-second next-round countdown.
- Automatically start the next hand or round when the countdown ends.
- Do not start another hand or round if the match is complete.
- Show a clear match winner screen when the target is reached.

## Spectator Safety

Spectators may see:

- Room status
- Public settings
- Public score
- Public match/round result
- Public bracket status, when applicable

Spectators must not see:

- Hidden hands
- Private player session identifiers
- Admin keys
- Host-only controls
- Player-only action controls

## Admin And Host Tools

Admin or host tools must be separate from player seats.

Hosts should not be required to occupy Player 1 or Player 2. Host controls should use explicit host/admin verification and should never be shown to ordinary players or spectators.

## Free-Play Standard

All games are free-play only by default.

Do not add payment, wallet, deposit, paid-entry, prize, betting, gambling, or wagering features or wording unless legal approval exists later and the product requirements explicitly change.

## Implementation Checklist

Before a 1V1 game is considered ready for tester use:

- Player 1 can create a room.
- Player 2 can join by link/code.
- A third visitor becomes spectator.
- The opening screen shows settings/rules first.
- The pre-match lobby shows room code, invite links, player slots, ready status, and settings.
- No gameplay UI appears before both players are seated, ready, and through any required start sequence.
- Both players can ready up.
- The 5-second countdown starts once.
- Gameplay starts only after countdown completion and any required start sequence.
- Hidden hands remain hidden from spectators.
- The score screen appears after each hand/round.
- The next hand/round starts automatically when appropriate.
- Match completion stops automatic next-round start.
- Host/admin controls are not tied to player seats.
- Free-play copy is clear and compliant with the current product rules.
