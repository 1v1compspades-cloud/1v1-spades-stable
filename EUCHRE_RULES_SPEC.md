# Euchre Rules Specification

## Ruleset Name

Default ruleset: Community Competitive 1v1 Euchre.

This is the default ruleset for `1v1-euchre-freeplay`.

## Deck

Use a 24-card Euchre deck:

- 9
- 10
- J
- Q
- K
- A

Suits:

- Clubs
- Diamonds
- Hearts
- Spades

## Players

The game is 1v1:

- Player 1
- Player 2

No partnerships are used.

## Deal

Each player receives 5 cards.

A kitty is created from the remaining cards.

An upcard is revealed from the kitty to begin trump selection.

## Trump Selection

Trump selection has two rounds.

### Round 1

Players may accept the upcard suit as trump or pass.

If trump is accepted, that suit becomes trump and the hand begins.

### Round 2

If both players pass in round 1, players may choose a different trump suit or pass.

The upcard suit cannot be selected in round 2.

## Stick the Dealer

Stick the Dealer is ON by default.

When Stick the Dealer is ON, if both players pass through both trump-selection rounds, the dealer must choose trump.

When Stick the Dealer is OFF, if both players pass through both rounds, the hand is redealt.

## Bowers

The right bower is the Jack of the trump suit. It is the highest card in the hand.

The left bower is the Jack of the same color as trump. It is the second-highest trump card and counts as part of the trump suit for all legal-play and trick-resolution purposes.

Examples:

- If Hearts are trump, Jack of Hearts is right bower.
- If Hearts are trump, Jack of Diamonds is left bower and counts as Hearts.
- If Clubs are trump, Jack of Clubs is right bower.
- If Clubs are trump, Jack of Spades is left bower and counts as Clubs.

## Effective Suit

For most cards, effective suit equals printed suit.

For the left bower, effective suit equals trump suit.

Legal-card validation and trick winner logic must use effective suit, not just printed suit.

## Card Order

### Trump Suit

Trump cards rank from highest to lowest:

1. Right bower
2. Left bower
3. Ace of trump
4. King of trump
5. Queen of trump
6. 10 of trump
7. 9 of trump

### Non-Trump Suits

Non-trump cards rank from highest to lowest:

1. Ace
2. King
3. Queen
4. Jack
5. 10
6. 9

The left bower is removed from its printed suit and treated as trump.

## Trick Play

Each hand has 5 tricks.

The leader plays the first card of a trick. The other player must follow the led effective suit if able.

If a player cannot follow suit, they may play any card.

The trick winner leads the next trick.

## Trick Winner

A trick is won by:

1. The highest trump card played, if any trump was played.
2. Otherwise, the highest card in the led effective suit.

## Maker

The maker is the player who chooses or accepts trump.

The maker needs at least 3 tricks to score.

## Scoring

- Maker wins 3 or 4 tricks: maker scores 1 point
- Maker wins 5 tricks: maker scores 2 points
- Defender wins 3 or more tricks: defender euchres maker and scores 2 points

## Match Win Condition

Default match length: first player to 10 points wins.

Fast Game uses first player to 5 points.

## Rules Locked During Tournament Matches

Tournament Mode rules are locked after a match starts. Players and admins should not be able to change scoring, Stick the Dealer, target score, or trump rules mid-match.
