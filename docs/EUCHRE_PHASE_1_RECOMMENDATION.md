# Euchre Phase 1 Recommendation

## Recommended Phase 1 Goal

Create the standalone `1v1-euchre-freeplay` app shell and implement a tested Euchre rules engine before building live gameplay.

Phase 1 should still avoid full multiplayer complexity until the rules engine and route structure are stable.

## Recommended Phase 1 Scope

Build:

- New standalone project scaffold
- Home page
- Rules page
- Game mode definitions
- Static tournament lobby placeholder
- Static match room placeholder
- Admin-key tournament flow design stub
- Euchre engine module with tests

Do not build yet:

- Real-time multiplayer
- Full bracket persistence
- Live card-playing UI
- Spectator mode
- Account system
- Any non-free-play competition feature

## Recommended Implementation Order

1. Scaffold the standalone project.
2. Move the existing root-level Phase 0 docs in the private GitHub repository into `/docs`.
3. Add mode constants for Community Competitive, Classic Casual, Fast Game, Tournament Mode, and Practice Mode.
4. Add Euchre engine tests for deck, bowers, effective suit, legal play, trick winner, scoring, and Stick the Dealer.
5. Implement the minimum engine needed to pass those tests.
6. Add static routes for home, rules, quick match, play a friend, tournaments, and match rooms.
7. Add a non-functional tournament admin UI mock that clearly separates public player controls from host-only controls.
8. Review security boundaries before adding persistence or live play.

## Recommended Phase 1 Command

```text
Create Phase 1 for the standalone 1v1-euchre-freeplay project. Do not modify or import any Spades project files. Move the existing root-level Phase 0 planning docs into /docs before adding app code. Build a new free-play Euchre app shell with home, rules, Quick Match, Play a Friend, tournament lobby, admin-key host placeholders, and match-room placeholders. Add a tested Euchre rules engine for 24-card 1v1 Euchre with bowers, effective suit, legal play based on following the led suit when possible, trump lead allowed immediately after trump is chosen, no broken-trump or cut-trump restriction, trick winner, scoring, first-to-10 default, Fast Game first-to-5, and Stick the Dealer behavior. Planning docs only may be reused from /docs. Keep the project strictly free-play.
```

## Open Questions Before Coding

- Which framework should the standalone project use?
- Should tournament state be stored in memory for the first prototype, or should Phase 1 include database selection?
- Should player identity be anonymous display names only for the first version?
- Should Play a Friend generate seat-specific links immediately, or should both players join a shared waiting room first?
- How many players should a tournament support in the first working version?
- Should odd-player tournaments use byes in Phase 1?
- Should match results be automatic only, or should players have a confirmation/reporting step?
- How should the host recover an admin key if the page is closed?
- Should admin key verification create a temporary host session?
- What should Practice Mode hints look like in the first UI version?
