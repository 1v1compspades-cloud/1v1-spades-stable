# Euchre Game Modes

## Mode Selection Principles

Game modes should be explicit, easy to compare, and safe for free-play use.

Each mode should define:

- Stick the Dealer setting
- Target score
- Whether hints are enabled
- Whether rules can change after match start
- Whether admin controls are required

## 1. Community Competitive

Default mode.

Rules:

- Stick the Dealer: ON
- Target score: 10
- Hints: OFF by default
- Rules lock after match start: YES
- Admin key required: NO for ordinary matches

Use this for Quick Match and most Play a Friend games.

## 2. Classic Casual

Rules:

- Stick the Dealer: OFF
- Target score: 10
- Hints: optional later
- Rules lock after match start: YES
- Admin key required: NO

If both players pass twice during trump selection, the hand is redealt.

Use this for players who expect a more traditional pass-and-redeal flow.

## 3. Fast Game

Rules:

- Stick the Dealer: ON
- Target score: 5
- Hints: OFF by default
- Rules lock after match start: YES
- Admin key required: NO

Use this for shorter casual matches.

## 4. Tournament Mode

Rules:

- Stick the Dealer: ON
- Target score: 10
- Hints: OFF
- Rules lock after match start: YES
- Admin key required for host tools: YES

Tournament Mode should prioritize consistent results, bracket integrity, clear player links, and host recovery controls.

The public player experience should not expose admin controls.

## 5. Practice Mode

Rules:

- Stick the Dealer: ON by default
- Target score: configurable later
- Hints: ON
- Rules lock after match start: optional
- Admin key required: NO

Practice Mode should teach:

- Bower behavior
- Effective suit
- Legal card choices
- Trump ranking
- Why a card is or is not playable

Practice Mode is for learning only and should stay separate from Tournament Mode.

## Recommended Defaults

Default public mode: Community Competitive.

Default tournament mode: Tournament Mode.

Default learning mode: Practice Mode.
