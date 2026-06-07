# Euchre Engine Test Plan

## Purpose

Define the tests needed before or during Phase 1 engine implementation.

No engine code exists in Phase 0. This document describes expected test coverage for a future Euchre rules engine.

## Test Categories

### Deck Tests

Verify:

- Deck has exactly 24 cards.
- Deck includes only 9, 10, J, Q, K, A.
- Deck includes all four suits.
- No duplicate cards exist.

### Deal Tests

Verify:

- Two players receive 5 cards each.
- Kitty exists after dealing.
- Upcard is available for trump selection.
- No dealt card appears in multiple places.

### Trump Selection Tests

Verify:

- Round 1 can accept the upcard suit.
- Round 1 can pass.
- Round 2 cannot select the upcard suit.
- Round 2 can select a non-upcard suit.
- Stick the Dealer ON forces dealer to choose trump after all passes.
- Stick the Dealer OFF causes redeal after all passes.

### Bower Tests

Verify:

- Right bower is highest trump.
- Left bower is second-highest trump.
- Left bower effective suit is trump.
- Left bower does not count as its printed suit for following-suit checks.
- Left bower beats Ace of trump.
- Right bower beats left bower.

### Legal Play Tests

Verify:

- Trump may be led immediately after trump is selected.
- There is no broken-trump or cut-trump restriction.
- Player must follow the led suit when able.
- Player may play any card only when unable to follow suit.
- A left bower in hand can satisfy a requirement to follow trump.
- A left bower in hand does not satisfy a requirement to follow its printed suit.

### Trick Winner Tests

Verify:

- Highest card of led suit wins when no trump is played.
- Any trump beats non-trump led-suit cards.
- Higher trump beats lower trump.
- Right bower wins over all cards.
- Left bower wins over all cards except right bower.

### Scoring Tests

Verify:

- Maker with 3 tricks scores 1 point.
- Maker with 4 tricks scores 1 point.
- Maker with 5 tricks scores 2 points.
- Defender with 3 tricks scores 2 points.
- Defender with 4 tricks scores 2 points.
- Defender with 5 tricks scores 2 points.
- Match ends when a player reaches the target score.
- Default target score is 10.
- Fast Game target score is 5.

### Mode Tests

Verify:

- Community Competitive uses Stick the Dealer ON and target score 10.
- Classic Casual uses Stick the Dealer OFF and redeals after all passes.
- Fast Game uses Stick the Dealer ON and target score 5.
- Tournament Mode locks rules after match start.
- Practice Mode enables hints and legal-card help.

### Tournament Safety Tests

Verify later server-side behavior:

- Player join links do not include admin key.
- Admin tools are unavailable without verified admin key.
- Admin actions fail without server-side authorization.
- Tournament rules cannot change after match start.
- Match links do not reveal hidden state.
- Spectator views do not receive private hands.

## Suggested Test Fixtures

Create fixtures for:

- Hearts trump with Jack of Diamonds as left bower.
- Diamonds trump with Jack of Hearts as left bower.
- Clubs trump with Jack of Spades as left bower.
- Spades trump with Jack of Clubs as left bower.
- No-trump-played trick.
- Trump-over-led-suit trick.
- Failed follow-suit attempt.
- Stick the Dealer forced choice.
- Classic Casual redeal.

## Phase 1 Test Recommendation

Build the engine with tests first for:

1. Effective suit
2. Trump ranking
3. Legal play
4. Trick winner
5. Scoring
6. Stick the Dealer

These tests should run before any UI work depends on the engine.
