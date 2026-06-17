# June 1 Checkpoint — Bid modal score visibility fix

Stable build for Sunday's live tournament event.

## What's in this version

- All prior fixes from `JUNE_1_STABLE_FINALS_FIXED_LIVE.md` (finals seating reclaim, ghost rematch, mobile bid scroll, invite link, finals transition flash filter, host tools safe slice).
- **New:** Player score rows lifted to `z-[110]` so both seats' scores stay visible while the bidding modal is open on mobile.

## Live validation

- Tournament `EN8NRW` (4 players, "Test") ran end-to-end on production with zero errors, zero warnings, zero admin interventions. Champion: OgSoloSpader.
- Mobile bid score fix added on top of that proven build.

## Safe to deploy

- Single one-line CSS change in `artifacts/spades-game/src/pages/Room.tsx`.
- No game logic, socket, scoring, tournament, or room state touched.
- Typecheck passes.
