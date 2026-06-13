# Universal Game Fixture

`packages/game-shell-core` holds the reusable local app shell pieces that should be shared by Spades, Euchre, Hearts, and future focused card apps.

## What Belongs Here

- In-memory room repository for local prototype state.
- Local active-room session persistence.
- Seat and viewer helpers for player/spectator identity.
- Generic create, join, ready, leave, and reset room lifecycle patterns.
- Local fixture helpers for memory storage, preset lookup, and manual view switching.
- In-memory match history storage with game-provided summary serialization.

## What Stays In Each Game

- Deck construction and deal rules.
- Bidding rules.
- Legal play rules.
- Trick resolution.
- Scoring.
- Game-specific phases.
- Game-specific sanitized room fields.
- Game-specific fixture decks and expected outcomes.

## Package Layout

```text
packages/game-shell-core/
  src/
    fixture-harness.js
    local-match-history.js
    local-room-session.js
    room-lifecycle.js
    room-repository.js
    seat-viewer.js
    index.js
  tests/
```

## How Spades Uses It

The Spades prototype imports reusable shell infrastructure from `packages/game-shell-core/src/index.js`.

Spades still owns:

- `apps/spades-table-prototype/src/room-state.js`
- `apps/spades-table-prototype/src/app-controller.js`
- `apps/spades-table-prototype/src/manual-harness.js`

Those modules wire the generic shell helpers into Spades-specific room phases, bidding, play-card actions, scoring, and sanitized text status.

## Cloning For A New Game

1. Create a focused app folder, for example `apps/hearts-table-prototype`.
2. Create or reuse a game rules package, for example `packages/hearts-core`.
3. Import generic helpers from `packages/game-shell-core/src/index.js`.
4. Build a game-specific `room-state.js` that uses:
   - `createTwoPlayerRoomLifecycle` or a future game-specific lifecycle variant.
   - `createInMemoryRoomRepository`.
   - `createLocalRoomSessionStorage({ namespace: "hearts" })`.
   - `createInMemoryMatchHistory` with a Hearts summary serializer.
5. Keep game phases and legal actions in the game app.
6. Keep fixture decks and manual presets in the game app.
7. Add tests that prove hidden information is sanitized for both player seats and spectators.

## Design Rule

The universal fixture should never know Spades, Euchre, Hearts, or any other game's rules. It should only know how local rooms, seats, sessions, fixture views, and immutable local summaries work.
