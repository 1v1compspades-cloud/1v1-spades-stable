# Spades Master Architecture Phase 0

## System Overview

Spades Master is a clean 1v1 Spades platform built from the proven Euchre app architecture. Phase 0 establishes the project boundaries, names, lifecycles, and test-first scaffolds before gameplay, table UI, networking, or legacy Spades lobby code is introduced.

The platform is organized around three layers:

- `packages/spades-core`: pure 1v1 Spades rules, scoring, and match-state transitions.
- `apps/spades-table-prototype`: future browser prototype shell for room, account, quick match, leaderboard, and tournament-history flows.
- `docs`: architecture, rules, migration, and implementation guidance.

The Euchre app is the master pattern for architecture concepts only. Spades must not import Euchre gameplay rules, and it must not import old fragile Spades lobby or UI logic.

## Product Direction

Spades Master is app-first, not website-first. The iOS, TestFlight, and mobile app experience is the primary product.

Web can exist for support, landing pages, tournaments, and admin tools, but gameplay should feel like a native mobile app. Table layout, navigation, reconnect, matchmaking, and controls should be optimized for phone-first play before desktop web polish.

Spades, Euchre, Hearts, and future games should each be their own focused app instead of one cluttered combined website. Shared architecture and modules are allowed underneath, but user-facing apps should remain separate, clean, and game-specific.

## Module Boundaries

### `packages/spades-core`

Owns:

- 52-card deck model.
- 1v1 deal model.
- Bidding and nil bid validation.
- Legal-play validation.
- Spades-broken tracking.
- Trick resolution.
- Bags and nil scoring.
- Match-completion checks.

Does not own:

- Browser storage.
- Accounts.
- Room codes or seat tokens.
- Reconnect persistence.
- Quick match queues.
- Leaderboards.
- Tournament history.
- UI rendering.
- Network transport.

### `apps/spades-table-prototype`

Owns later:

- Home/settings shell.
- Room shell.
- Profile/account shell.
- Leaderboard shell.
- Quick match shell.
- Tournament history shell.
- Wiring between platform state and `spades-core`.

Does not own in Phase 0:

- Gameplay UI.
- Card rendering.
- Animations.
- Networking.
- Server state.
- Old Spades lobby behavior.

### Future Platform State Modules

The following modules should be ported conceptually from Euchre, renamed for Spades, and implemented only after the core scaffold is in place:

- `account-state.js`
- `local-room-session.js`
- `leaderboard-state.js`
- `quick-match-state.js`
- `tournament-history-state.js`
- `persistence.js`
- `room-state.js`

## State Ownership

State ownership must stay explicit so reconnects and tests remain predictable.

- Core game state belongs to `packages/spades-core`.
- Room lifecycle state belongs to future `room-state.js`.
- Local browser recovery state belongs to future `local-room-session.js`.
- Account identity state belongs to future `account-state.js`.
- Queue state belongs to future `quick-match-state.js`.
- Public ranking state belongs to future `leaderboard-state.js`.
- Completed tournament archive state belongs to future `tournament-history-state.js`.
- Durable storage adapters belong to future `persistence.js`.

Hidden player hand state must never be exposed to spectators or unrelated sessions. Sanitized view builders should be introduced before any networked room work.

## Room Lifecycle

The room lifecycle follows the successful Euchre pattern, adapted for 1v1 Spades:

1. Player enters display name and match settings.
2. Player 1 creates a room.
3. The room receives a room code, Player 1 seat token, and free-play match settings.
4. Player 2 joins by room code or invite link.
5. A third visitor becomes a spectator.
6. Both seated players ready up.
7. A ready countdown is stored in room state.
8. After the countdown, the Spades hand lifecycle begins.
9. Players bid.
10. Players play tricks.
11. Hand score is applied.
12. The next hand starts if no player has reached the target score.
13. Match completion records leaderboard and tournament-history side effects once.

Phase 0 does not implement this lifecycle. It defines the lifecycle so Phase 1 can implement it without old lobby assumptions.

## Reconnect Lifecycle

Reconnect follows the Euchre identity hierarchy:

1. Restore by room-specific seat token.
2. Restore by browser/player ID.
3. Restore by account ID.
4. Fall back to spectator.

Expected future local storage keys should use Spades-specific names:

- `spadesRoomSeat`
- `spadesRoomSeatsByRoom`
- `spades.room.<ROOM_CODE>.seatToken`

Reconnect must not:

- Seat the same browser twice.
- Seat the same account twice.
- Expose hidden cards to spectators.
- Restart ready countdowns.
- Duplicate leaderboard records.
- Duplicate quick match queue entries.

## Account Lifecycle

The account lifecycle maps from Euchre's lightweight account model:

1. Guest identity exists first as a browser/player ID.
2. User may create or upgrade to an account.
3. Username and display name are normalized.
4. Account identity names are used to block duplicate seating and duplicate queue entries.
5. Public account output is sanitized before display.

Accounts are not authentication in Phase 0. They are an architecture boundary for stable identity, reconnect, leaderboard rows, and duplicate-prevention rules.

## Quick Match Lifecycle

Quick Match maps from Euchre's queue model:

1. Player enters queue with player ID, optional account ID, display name, and match settings.
2. Existing active queue entry is reused.
3. Duplicate identity names are rejected.
4. Old queue entries expire.
5. Compatible waiting entries are matched.
6. A room is created for matched players.
7. Matched entries reference the room code.
8. Completed rooms mark related queue entries complete.

Compatibility for Phase 1 should include:

- 1v1 Spades mode ID.
- Target score.
- Nil settings.
- Bag penalty settings.

## Leaderboard Lifecycle

Leaderboard recording maps from Euchre's completed-room pattern:

1. A room reaches `match_complete`.
2. A winner is present.
3. The room has not already been recorded.
4. Winner and loser have stat keys from account ID or guest/player ID.
5. Wins, losses, matches played, points for, and points against are updated.
6. The room receives `leaderboardRecordedAt`.
7. Public leaderboard rows are sanitized and sorted.

Spades-specific Phase 1 consideration: points for and against should use final match score, not individual hand bid totals.

## Tournament History Lifecycle

Tournament history maps from Euchre's completed-tournament archive:

1. Tournament status becomes `complete`.
2. Tournament winner is present.
3. Final room score is available when possible.
4. A single history record is created per tournament code.
5. Record includes champion, runner-up, bracket size, match count, final score, created time, and completed time.
6. Public history output is sanitized.

Phase 0 does not build tournament brackets or admin controls. It reserves the completed-history boundary so tournament features can be added without rewriting leaderboard or room completion code.

## Euchre Concept Mapping

| Euchre Concept | Spades Mapping | Phase 0 Action |
| --- | --- | --- |
| Room code | Room code | Document only |
| Seat token | Seat token | Document only |
| Player/account reconnect | Player/account reconnect | Document only |
| Active room clear | Active room clear | Document storage names |
| Quick match queue | Quick match queue | Document compatibility fields |
| Leaderboard stats | Leaderboard stats | Document completion trigger |
| Tournament history | Tournament history | Document record shape |
| Free-play copy | Free-play copy | Preserve wording standard |
| Expo TestFlight wrapper | Future Spades wrapper | Defer implementation |
| Euchre trump/maker/upcard | No Spades equivalent | Do not port |
| Euchre card engine | Spades core engine | Rewrite |

## Phase 0 Constraints

- 1v1 Spades only.
- No old Spades lobby or UI imports.
- No table UI.
- No networking.
- No card rendering.
- No coin flip.
- No animations.
- No gameplay implementation.
- Tests are created first and may contain placeholders/TODOs.
