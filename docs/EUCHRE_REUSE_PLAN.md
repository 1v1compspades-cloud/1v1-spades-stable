# Euchre Reuse Plan

## Standalone Boundary

`1v1-euchre-freeplay` is a standalone project.

Do not modify the Spades project.

Do not depend on the Spades ZIP.

Do not import Spades files.

Do not copy Spades gameplay code into this project.

## What Can Be Reused Conceptually

General product ideas can be reused at the planning level:

- A simple home page
- Clear rules page
- Quick Match entry point
- Play a Friend flow
- Tournament lobby concept
- Match-room route concept
- Host-only tournament controls
- Shareable player links
- Public bracket display

These should be reimplemented for Euchre from scratch.

## What Must Be New

The following must be designed and implemented specifically for Euchre:

- Euchre deck model
- Euchre trump selection
- Bower handling
- Effective suit logic
- Legal-card validation
- Trick winner logic
- Maker and defender scoring
- Stick the Dealer behavior
- Euchre-specific rules copy
- Euchre-specific UI states
- Euchre-specific test fixtures

## Risk Areas

The largest risk in a Euchre implementation is treating left bower as its printed suit instead of trump.

Other risks:

- Allowing illegal off-suit plays when a player can follow effective suit
- Accidentally adding a broken-trump or cut-trump rule that does not belong in Euchre
- Scoring maker and defender incorrectly
- Mishandling Stick the Dealer
- Letting tournament rules change after match start
- Exposing admin controls or admin key to players
- Leaking private hand state to spectators later

## Acceptable Shared Dependencies

If this becomes a web app in Phase 1, it may use common open-source libraries selected for the new project, such as:

- Web framework
- Styling system
- Test runner
- State management library
- Database client
- ID generation library

Any dependency should be added intentionally for this standalone project.

## Reuse Checklist Before Coding

Before Phase 1 coding begins, confirm:

- The repository is new or clearly separate from Spades.
- No Spades source files are imported.
- No Spades ZIP is required.
- Package names, routes, and docs refer to Euchre, not Spades.
- The rules engine is specified around Euchre behavior.
- Tournament/admin language stays free-play and non-monetary.
