# Euchre Folder Structure

## Goal

Define a clean standalone structure for the future `1v1-euchre-freeplay` project.

Phase 0 creates planning docs only. This file is a recommendation for Phase 1 and beyond.

## Recommended Top-Level Structure

```text
1v1-euchre-freeplay/
  docs/
    EUCHRE_PHASE_0_BLUEPRINT.md
    EUCHRE_RULES_SPEC.md
    EUCHRE_GAME_MODES.md
    EUCHRE_TOURNAMENT_ADMIN_PLAN.md
    EUCHRE_REUSE_PLAN.md
    EUCHRE_ENGINE_TEST_PLAN.md
    EUCHRE_FOLDER_STRUCTURE.md
    EUCHRE_PHASE_1_RECOMMENDATION.md
  src/
    app/
    components/
    features/
    lib/
    styles/
  tests/
  public/
  package.json
  README.md
```

## Suggested Source Structure

```text
src/
  app/
    page.tsx
    rules/
      page.tsx
    quick-match/
      page.tsx
    friend/
      page.tsx
    tournaments/
      page.tsx
      [tournamentCode]/
        page.tsx
        admin/
          page.tsx
    matches/
      [matchId]/
        page.tsx
  components/
    layout/
    navigation/
    cards/
    forms/
    tournament/
    match/
  features/
    euchre/
      rules/
      engine/
      modes/
      scoring/
    tournaments/
      lobby/
      bracket/
      admin/
      links/
    matches/
      room/
      reporting/
  lib/
    ids/
    validation/
    server/
  styles/
```

## Suggested Test Structure

```text
tests/
  euchre/
    deck.test.ts
    effective-suit.test.ts
    bowers.test.ts
    legal-play.test.ts
    trick-winner.test.ts
    scoring.test.ts
    modes.test.ts
  tournaments/
    admin-key.test.ts
    join-links.test.ts
    bracket.test.ts
    match-completion.test.ts
```

## Ownership Boundaries

### Euchre Engine

Owns:

- Deck
- Deal
- Trump selection state
- Effective suit
- Legal-card validation
- Trick winner
- Scoring
- Match completion

Does not own:

- Routing
- Admin key verification
- Database persistence
- User interface rendering

### Tournament Feature

Owns:

- Tournament creation
- Public tournament code
- Player lobby
- Bracket generation
- Match assignment
- Admin actions
- Match result advancement

Does not own:

- Euchre card logic
- Private card visibility rules beyond passing through match-safe data

### Match Room

Owns:

- Player match session UI
- Current match state display
- Player actions
- Score reporting or completion flow

Does not own:

- Tournament creation
- Admin key generation
- Global bracket rules

## Naming Guidance

Use Euchre-specific names in source and tests.

Avoid Spades names, packages, routes, fixtures, or copied terminology.

Keep terminology focused on free-play matches and tournaments.
