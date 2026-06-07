export const SUITS = Object.freeze(["clubs", "diamonds", "hearts", "spades"]);
export const RANKS = Object.freeze(["9", "10", "J", "Q", "K", "A"]);

export const PLAYERS = Object.freeze(["player1", "player2"]);

export const GAME_MODES = Object.freeze({
  communityCompetitive: Object.freeze({
    id: "communityCompetitive",
    name: "Community Competitive",
    stickTheDealer: true,
    redealOnDoublePass: false,
    targetScore: 10,
    rulesLocked: true,
    hintsEnabled: false
  }),
  classicCasual: Object.freeze({
    id: "classicCasual",
    name: "Classic Casual",
    stickTheDealer: false,
    redealOnDoublePass: true,
    targetScore: 10,
    rulesLocked: true,
    hintsEnabled: false
  }),
  fastGame: Object.freeze({
    id: "fastGame",
    name: "Fast Game",
    stickTheDealer: true,
    redealOnDoublePass: false,
    targetScore: 5,
    rulesLocked: true,
    hintsEnabled: false
  }),
  tournamentMode: Object.freeze({
    id: "tournamentMode",
    name: "Tournament Mode",
    stickTheDealer: true,
    redealOnDoublePass: false,
    targetScore: 10,
    rulesLocked: true,
    hintsEnabled: false
  }),
  practiceMode: Object.freeze({
    id: "practiceMode",
    name: "Practice Mode",
    stickTheDealer: true,
    redealOnDoublePass: false,
    targetScore: 10,
    rulesLocked: false,
    hintsEnabled: true
  })
});

const SAME_COLOR_SUIT = Object.freeze({
  clubs: "spades",
  spades: "clubs",
  diamonds: "hearts",
  hearts: "diamonds"
});

const NON_TRUMP_RANK_VALUE = Object.freeze({
  "9": 1,
  "10": 2,
  J: 3,
  Q: 4,
  K: 5,
  A: 6
});

const TRUMP_RANK_VALUE = Object.freeze({
  "9": 1,
  "10": 2,
  Q: 3,
  K: 4,
  A: 5
});

export function createDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));
}

export function assertCard(card) {
  if (!card || !RANKS.includes(card.rank) || !SUITS.includes(card.suit)) {
    throw new Error("Invalid Euchre card");
  }
}

export function assertSuit(suit) {
  if (!SUITS.includes(suit)) {
    throw new Error(`Invalid suit: ${suit}`);
  }
}

export function deal(deck = createDeck()) {
  if (!Array.isArray(deck) || deck.length !== 24) {
    throw new Error("Deal requires a 24-card deck");
  }

  return {
    hands: {
      player1: deck.slice(0, 5),
      player2: deck.slice(5, 10)
    },
    kitty: deck.slice(10),
    upcard: deck[10]
  };
}

export function createTrumpSelection({ dealer = "player2", upcardSuit, mode = GAME_MODES.communityCompetitive } = {}) {
  assertPlayer(dealer);
  assertSuit(upcardSuit);

  return {
    dealer,
    upcardSuit,
    round: 1,
    passes: [],
    trumpSuit: null,
    maker: null,
    forcedDealerChoice: false,
    redealRequired: false,
    complete: false,
    mode
  };
}

export function passTrump(state, player) {
  assertSelectionOpen(state);
  assertPlayer(player);

  const passes = [...state.passes, { player, round: state.round }];
  const roundPasses = passes.filter((pass) => pass.round === state.round);

  if (state.round === 1 && roundPasses.length >= 2) {
    return { ...state, round: 2, passes };
  }

  if (state.round === 2 && roundPasses.length >= 2) {
    if (state.mode.stickTheDealer) {
      return { ...state, passes, forcedDealerChoice: true };
    }

    return { ...state, passes, complete: true, redealRequired: true };
  }

  return { ...state, passes };
}

export function chooseTrump(state, player, suit) {
  assertSelectionOpen(state);
  assertPlayer(player);
  assertSuit(suit);

  if (state.round === 2 && suit === state.upcardSuit) {
    throw new Error("Cannot choose the upcard suit in trump selection round 2");
  }

  if (state.forcedDealerChoice && player !== state.dealer) {
    throw new Error("Stick the Dealer requires the dealer to choose trump");
  }

  return {
    ...state,
    trumpSuit: suit,
    maker: player,
    complete: true,
    redealRequired: false,
    forcedDealerChoice: false
  };
}

export function isRightBower(card, trumpSuit) {
  assertCard(card);
  assertSuit(trumpSuit);
  return card.rank === "J" && card.suit === trumpSuit;
}

export function isLeftBower(card, trumpSuit) {
  assertCard(card);
  assertSuit(trumpSuit);
  return card.rank === "J" && card.suit === SAME_COLOR_SUIT[trumpSuit];
}

export function effectiveSuit(card, trumpSuit) {
  assertCard(card);
  assertSuit(trumpSuit);
  return isLeftBower(card, trumpSuit) ? trumpSuit : card.suit;
}

export function isTrump(card, trumpSuit) {
  return effectiveSuit(card, trumpSuit) === trumpSuit;
}

export function cardPower(card, trumpSuit, ledSuit) {
  assertCard(card);
  assertSuit(trumpSuit);
  assertSuit(ledSuit);

  if (isRightBower(card, trumpSuit)) return 100;
  if (isLeftBower(card, trumpSuit)) return 99;
  if (isTrump(card, trumpSuit)) return 90 + TRUMP_RANK_VALUE[card.rank];
  if (effectiveSuit(card, trumpSuit) === ledSuit) return NON_TRUMP_RANK_VALUE[card.rank];
  return 0;
}

export function canLeadCard({ trumpSuit }) {
  assertSuit(trumpSuit);
  return true;
}

export function getPlayableCards(hand, ledCard, trumpSuit) {
  if (!Array.isArray(hand)) {
    throw new Error("Hand must be an array");
  }

  hand.forEach(assertCard);
  assertSuit(trumpSuit);

  if (!ledCard) {
    return [...hand];
  }

  assertCard(ledCard);
  const ledSuit = effectiveSuit(ledCard, trumpSuit);
  const followingSuit = hand.filter((card) => effectiveSuit(card, trumpSuit) === ledSuit);
  return followingSuit.length > 0 ? followingSuit : [...hand];
}

export function isLegalPlay({ hand, card, ledCard = null, trumpSuit }) {
  return getPlayableCards(hand, ledCard, trumpSuit).some((playable) => cardsEqual(playable, card));
}

export function determineTrickWinner(plays, trumpSuit) {
  if (!Array.isArray(plays) || plays.length !== 2) {
    throw new Error("A 1v1 Euchre trick requires exactly 2 plays");
  }

  plays.forEach((play) => {
    assertPlayer(play.player);
    assertCard(play.card);
  });
  assertSuit(trumpSuit);

  const ledSuit = effectiveSuit(plays[0].card, trumpSuit);
  return plays.reduce((winner, play) => {
    const winnerPower = cardPower(winner.card, trumpSuit, ledSuit);
    const playPower = cardPower(play.card, trumpSuit, ledSuit);
    return playPower > winnerPower ? play : winner;
  });
}

export function scoreHand({ maker, tricksWon }) {
  assertPlayer(maker);

  const defender = otherPlayer(maker);
  const makerTricks = tricksWon[maker] ?? 0;
  const defenderTricks = tricksWon[defender] ?? 0;

  if (makerTricks + defenderTricks !== 5) {
    throw new Error("A completed hand must have exactly 5 tricks");
  }

  if (makerTricks >= 5) {
    return { points: { [maker]: 2, [defender]: 0 }, euchred: false, sweep: true };
  }

  if (makerTricks >= 3) {
    return { points: { [maker]: 1, [defender]: 0 }, euchred: false, sweep: false };
  }

  return { points: { [maker]: 0, [defender]: 2 }, euchred: true, sweep: false };
}

export function applyScore(score, handScore) {
  return {
    player1: (score.player1 ?? 0) + (handScore.points.player1 ?? 0),
    player2: (score.player2 ?? 0) + (handScore.points.player2 ?? 0)
  };
}

export function getMatchWinner(score, targetScore = 10) {
  if ((score.player1 ?? 0) >= targetScore) return "player1";
  if ((score.player2 ?? 0) >= targetScore) return "player2";
  return null;
}

export function cardsEqual(a, b) {
  return Boolean(a && b && a.rank === b.rank && a.suit === b.suit);
}

function otherPlayer(player) {
  assertPlayer(player);
  return player === "player1" ? "player2" : "player1";
}

function assertPlayer(player) {
  if (!PLAYERS.includes(player)) {
    throw new Error(`Invalid player: ${player}`);
  }
}

function assertSelectionOpen(state) {
  if (!state || state.complete) {
    throw new Error("Trump selection is already complete");
  }
}
