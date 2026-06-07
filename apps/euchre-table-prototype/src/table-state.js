import {
  GAME_MODES,
  SUITS,
  applyScore,
  cardsEqual,
  chooseTrump,
  createDeck,
  createTrumpSelection,
  deal,
  determineTrickWinner,
  getMatchWinner,
  getPlayableCards,
  isLegalPlay,
  passTrump,
  scoreHand
} from "../../../packages/euchre-core/src/index.js";

export function createMatch({ modeId = "communityCompetitive", deck = shuffleDeck(createDeck()) } = {}) {
  const mode = GAME_MODES[modeId] ?? GAME_MODES.communityCompetitive;
  const match = {
    modeId: mode.id,
    mode,
    score: { player1: 0, player2: 0 },
    dealer: "player2",
    handNumber: 0,
    winner: null,
    hand: null
  };

  return startNewHand(match, { deck });
}

export function startNewHand(match, { deck = shuffleDeck(createDeck()) } = {}) {
  const mode = GAME_MODES[match.modeId] ?? GAME_MODES.communityCompetitive;
  const handNumber = (match.handNumber ?? 0) + 1;
  const dealer = handNumber === 1 ? match.dealer ?? "player2" : otherPlayer(match.dealer);
  const dealt = deal(deck);

  return {
    ...match,
    mode,
    dealer,
    handNumber,
    winner: getMatchWinner(match.score, mode.targetScore),
    hand: {
      phase: "selectingTrump",
      hands: cloneHands(dealt.hands),
      kitty: [...dealt.kitty],
      upcard: dealt.upcard,
      trumpSelection: createTrumpSelection({
        dealer,
        upcardSuit: dealt.upcard.suit,
        mode
      }),
      trumpSuit: null,
      maker: null,
      leader: otherPlayer(dealer),
      currentPlayer: otherPlayer(dealer),
      currentTrick: [],
      completedTricks: [],
      tricksWon: { player1: 0, player2: 0 },
      handScore: null
    }
  };
}

export function chooseTrumpForCurrentPlayer(match, suit) {
  requireHandPhase(match, "selectingTrump");
  const player = currentTrumpActor(match.hand.trumpSelection);
  const trumpSelection = chooseTrump(match.hand.trumpSelection, player, suit);

  return beginPlayAfterTrump(match, trumpSelection);
}

export function passTrumpForCurrentPlayer(match) {
  requireHandPhase(match, "selectingTrump");
  const player = currentTrumpActor(match.hand.trumpSelection);
  const trumpSelection = passTrump(match.hand.trumpSelection, player);

  if (trumpSelection.redealRequired) {
    return {
      ...match,
      hand: {
        ...match.hand,
        phase: "redealRequired",
        trumpSelection
      }
    };
  }

  return {
    ...match,
    hand: {
      ...match.hand,
      trumpSelection
    }
  };
}

export function playCard(match, player, card) {
  requireHandPhase(match, "playing");

  if (player !== match.hand.currentPlayer) {
    throw new Error(`It is ${match.hand.currentPlayer}'s turn`);
  }

  const hand = match.hand.hands[player];
  const ledCard = match.hand.currentTrick[0]?.card ?? null;
  const trumpSuit = match.hand.trumpSuit;

  if (!isLegalPlay({ hand, card, ledCard, trumpSuit })) {
    throw new Error("Card is not legal for the led suit");
  }

  const nextHands = {
    ...match.hand.hands,
    [player]: removeCard(hand, card)
  };
  const nextTrick = [...match.hand.currentTrick, { player, card }];

  if (nextTrick.length === 1) {
    return {
      ...match,
      hand: {
        ...match.hand,
        hands: nextHands,
        currentTrick: nextTrick,
        currentPlayer: otherPlayer(player)
      }
    };
  }

  const winnerPlay = determineTrickWinner(nextTrick, trumpSuit);
  const tricksWon = {
    ...match.hand.tricksWon,
    [winnerPlay.player]: match.hand.tricksWon[winnerPlay.player] + 1
  };
  const completedTricks = [
    ...match.hand.completedTricks,
    {
      plays: nextTrick,
      winner: winnerPlay.player
    }
  ];

  if (completedTricks.length === 5) {
    const handScore = scoreHand({ maker: match.hand.maker, tricksWon });
    const score = applyScore(match.score, handScore);
    const winner = getMatchWinner(score, match.mode.targetScore);

    return {
      ...match,
      score,
      winner,
      hand: {
        ...match.hand,
        hands: nextHands,
        currentTrick: [],
        completedTricks,
        tricksWon,
        handScore,
        phase: winner ? "matchComplete" : "handComplete",
        currentPlayer: null
      }
    };
  }

  return {
    ...match,
    hand: {
      ...match.hand,
      hands: nextHands,
      currentTrick: [],
      completedTricks,
      tricksWon,
      leader: winnerPlay.player,
      currentPlayer: winnerPlay.player
    }
  };
}

export function playableCardsFor(match, player) {
  if (!match.hand || match.hand.phase !== "playing" || player !== match.hand.currentPlayer) {
    return [];
  }

  return getPlayableCards(
    match.hand.hands[player],
    match.hand.currentTrick[0]?.card ?? null,
    match.hand.trumpSuit
  );
}

export function availableTrumpSuits(match) {
  const selection = match.hand?.trumpSelection;
  if (!selection || selection.complete) return [];

  if (selection.forcedDealerChoice || selection.round === 2) {
    return SUITS.filter((suit) => suit !== selection.upcardSuit);
  }

  return [selection.upcardSuit];
}

export function currentTrumpActor(selection) {
  if (selection.forcedDealerChoice) {
    return selection.dealer;
  }

  const order = [otherPlayer(selection.dealer), selection.dealer];
  const passesThisRound = selection.passes.filter((pass) => pass.round === selection.round).length;
  return order[passesThisRound % order.length];
}

export function cardLabel(card) {
  return `${card.rank}${suitSymbol(card.suit)}`;
}

export function suitSymbol(suit) {
  return {
    clubs: "♣",
    diamonds: "♦",
    hearts: "♥",
    spades: "♠"
  }[suit];
}

export function otherPlayer(player) {
  return player === "player1" ? "player2" : "player1";
}

function beginPlayAfterTrump(match, trumpSelection) {
  return {
    ...match,
    hand: {
      ...match.hand,
      phase: "playing",
      trumpSelection,
      trumpSuit: trumpSelection.trumpSuit,
      maker: trumpSelection.maker,
      currentPlayer: match.hand.leader
    }
  };
}

function removeCard(hand, card) {
  const index = hand.findIndex((candidate) => cardsEqual(candidate, card));
  if (index === -1) {
    throw new Error("Card is not in hand");
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function cloneHands(hands) {
  return {
    player1: [...hands.player1],
    player2: [...hands.player2]
  };
}

function shuffleDeck(deck) {
  const copy = [...deck];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function requireHandPhase(match, phase) {
  if (!match.hand || match.hand.phase !== phase) {
    throw new Error(`Expected hand phase ${phase}`);
  }
}
