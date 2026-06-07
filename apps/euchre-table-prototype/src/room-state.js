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

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const READY_COUNTDOWN_MS = 5000;
const NEXT_HAND_DELAY_MS = 5000;

export function createRoom({
  roomCode = generateRoomCode(),
  seatToken = generateSeatToken(),
  modeId = "communityCompetitive",
  displayName = "Player 1",
  coinFlipWinner = null,
  tournamentMatch = null
} = {}) {
  const mode = GAME_MODES[modeId] ?? GAME_MODES.communityCompetitive;
  const gameState = createWaitingGameState({ mode, modeId: mode.id });
  const name = normalizeDisplayName(displayName);

  return syncRoomFields({
    roomCode,
    players: {
      player1: {
        seat: "player1",
        seatToken,
        connected: true,
        displayName: name
      },
      player2: null
    },
    playerReady: {
      player1: false,
      player2: false
    },
    coinFlipWinner: null,
    coinFlipWinnerSeed: coinFlipWinner,
    startingPositionChoice: null,
    firstDealer: null,
    countdownStartedAt: null,
    countdownEndsAt: null,
    nextHandStartsAt: null,
    nextRoundStartsAt: null,
    tournamentMatch,
    gameState,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function joinRoom(room, { seatToken = generateSeatToken(), displayName = "Player 2" } = {}) {
  const existingSeat = seatForToken(room, seatToken);

  if (existingSeat) {
    return {
      room: markConnected(room, existingSeat),
      seat: existingSeat,
      seatToken
    };
  }

  if (!room.players.player2) {
    const name = normalizeDisplayName(displayName);
    return {
      room: syncRoomFields({
        ...room,
        players: {
          ...room.players,
          player2: {
            seat: "player2",
            seatToken,
            connected: true,
            displayName: name
          }
        },
        countdownStartedAt: null,
        countdownEndsAt: null,
        gameState: {
          ...room.gameState,
          phase: "pregame_settings",
          actionPhase: "pregame_settings"
        },
        updatedAt: new Date().toISOString()
      }),
      seat: "player2",
      seatToken
    };
  }

  throw roomError(409, "Room already has two seated players");
}

export function getViewerSeat(room, seatToken) {
  return seatForToken(room, seatToken) ?? "spectator";
}

export function applyRoomAction(room, { seatToken, type, suit, position, card, deck }) {
  const seat = seatForToken(room, seatToken);

  if (!seat) {
    throw roomError(403, "Join this room before taking a player action");
  }

  const gameState = room.gameState;

  if (type === "ready") {
    ensurePregameOrCountdown(gameState);
    ensureBothPlayersSeated(room);

    const nextReady = {
      ...room.playerReady,
      [seat]: true
    };

    return maybeStartReadyCountdown(syncRoomFields({
      ...room,
      playerReady: nextReady,
      updatedAt: new Date().toISOString()
    }));
  }

  if (type === "chooseStartingPosition") {
    ensurePhase(gameState, "dealer_choice");
    ensureBothPlayersSeated(room);

    if (seat !== room.coinFlipWinner) {
      throw roomError(403, "Only the coin flip winner chooses the starting position");
    }

    if (!["dealer", "non_dealer"].includes(position)) {
      throw new Error("Starting position must be dealer or non_dealer");
    }

    const firstDealer = position === "dealer" ? seat : otherPlayer(seat);

    return syncRoomFields({
      ...room,
      startingPositionChoice: position,
      firstDealer,
      countdownStartedAt: null,
      countdownEndsAt: null,
      gameState: startHand({
        ...gameState,
        dealer: firstDealer
      }, { deck }),
      updatedAt: new Date().toISOString()
    });
  }

  if (type === "chooseTrump") {
    ensureTurn(room, seat);
    ensurePhase(gameState, "selectingTrump");

    if (!availableTrumpSuits(gameState.trumpState).includes(suit)) {
      throw new Error("Trump suit is not available now");
    }

    const trumpState = chooseTrump(gameState.trumpState, seat, suit);
    const nextState = applyDealerPickupIfNeeded(gameState, trumpState);
    return syncRoomFields({
      ...room,
      gameState: {
        ...nextState,
        phase: "playing",
        actionPhase: "playing",
        trumpState,
        trumpSuit: trumpState.trumpSuit,
        maker: trumpState.maker,
        currentTurn: gameState.leader
      },
      updatedAt: new Date().toISOString()
    });
  }

  if (type === "passTrump") {
    ensureTurn(room, seat);
    ensurePhase(gameState, "selectingTrump");

    const trumpState = passTrump(gameState.trumpState, seat);

    if (trumpState.redealRequired) {
      return syncRoomFields({
        ...room,
        gameState: startHand({
          ...gameState,
          dealer: gameState.dealer,
          handHistory: [
            ...gameState.handHistory,
            {
              handNumber: gameState.handNumber,
              result: "redeal"
            }
          ]
        }, { deck }),
        updatedAt: new Date().toISOString()
      });
    }

    return syncRoomFields({
      ...room,
      gameState: {
        ...gameState,
        trumpState,
        currentTurn: trumpState.forcedDealerChoice
          ? trumpState.dealer
          : currentTrumpActor(trumpState)
      },
      updatedAt: new Date().toISOString()
    });
  }

  if (type === "playCard") {
    ensureTurn(room, seat);
    ensurePhase(gameState, "playing");
    return playCardForRoom(room, seat, card);
  }

  if (type === "startNextHand") {
    if (!["hand_score", "match_complete"].includes(gameState.phase)) {
      throw new Error("Current hand is not complete");
    }

    if (gameState.winner) {
      throw new Error("Match is already complete");
    }

    return syncRoomFields({
      ...room,
      gameState: startHand(gameState, { deck }),
      updatedAt: new Date().toISOString()
    });
  }

  throw new Error(`Unsupported room action: ${type}`);
}

export function sanitizeRoomForViewer(room, seatToken) {
  const safeRoom = syncRoomFields(room);
  const viewerSeat = getViewerSeat(safeRoom, seatToken);
  const state = safeRoom.gameState;
  const viewerHand = viewerSeat === "spectator" ? [] : [...state.hands[viewerSeat]];

  return {
    roomCode: safeRoom.roomCode,
    viewerSeat,
    players: {
      player1: Boolean(safeRoom.players.player1),
      player2: Boolean(safeRoom.players.player2)
    },
    playerNames: {
      player1: safeRoom.players.player1?.displayName ?? "Player 1",
      player2: safeRoom.players.player2?.displayName ?? null
    },
    playerReady: {
      player1: Boolean(safeRoom.playerReady?.player1),
      player2: Boolean(safeRoom.playerReady?.player2)
    },
    coinFlipWinner: safeRoom.coinFlipWinner,
    startingPositionChoice: safeRoom.startingPositionChoice,
    firstDealer: safeRoom.firstDealer,
    countdownStartedAt: safeRoom.countdownStartedAt,
    countdownEndsAt: safeRoom.countdownEndsAt,
    nextHandStartsAt: safeRoom.nextHandStartsAt,
    nextRoundStartsAt: safeRoom.nextRoundStartsAt,
    tournamentMatch: safeRoom.tournamentMatch
      ? sanitizeTournamentMatch(safeRoom.tournamentMatch, state)
      : null,
    gameState: {
      phase: state.phase,
      actionPhase: state.actionPhase,
      modeId: state.modeId,
      score: state.score,
      targetScore: state.mode.targetScore,
      winner: state.winner,
      currentTurn: state.currentTurn,
      dealer: state.dealer,
      currentDealer: state.dealer,
      handNumber: state.handNumber,
      trumpSuit: state.trumpSuit,
      maker: state.maker,
      trumpState: sanitizeTrumpState(state.trumpState),
      upcard: state.upcard,
      kittyCount: state.kitty.length,
      viewerHand,
      handCounts: {
        player1: state.hands.player1.length,
        player2: state.hands.player2.length
      },
      playableCards: viewerSeat === state.currentTurn && state.actionPhase === "playing" && state.trumpSuit
        ? getPlayableCards(viewerHand, state.currentTrick[0]?.card ?? null, state.trumpSuit)
        : [],
      currentTrick: state.currentTrick,
      completedTricks: state.completedTricks,
      tricksWon: state.tricksWon,
      handScore: state.handScore,
      handHistory: state.handHistory,
      countdownEndsAt: safeRoom.countdownEndsAt,
      nextHandStartsAt: safeRoom.nextHandStartsAt,
      nextRoundStartsAt: safeRoom.nextRoundStartsAt,
      availableTrumpSuits: state.actionPhase === "selectingTrump" && viewerSeat === state.currentTurn
        ? availableTrumpSuits(state.trumpState)
        : []
    },
    spectator: viewerSeat === "spectator"
      ? {
          readOnly: true,
          message: "Spectator view is read-only and does not include hidden hands."
        }
      : null
  };
}

export function advanceRoomClock(room, { now = Date.now(), deck } = {}) {
  if (!bothPlayersConnected(room)) {
    if (["ready_countdown", "coin_flip"].includes(room.gameState.phase)) {
      return syncRoomFields({
        ...room,
        coinFlipWinner: null,
        startingPositionChoice: null,
        firstDealer: null,
        countdownStartedAt: null,
        countdownEndsAt: null,
        gameState: {
          ...room.gameState,
          phase: "waiting_for_players",
          actionPhase: "waiting_for_players",
          currentTurn: null
        },
        updatedAt: new Date().toISOString()
      });
    }
    return room;
  }

  if (room.gameState.phase === "ready_countdown" && room.countdownEndsAt && now >= Date.parse(room.countdownEndsAt)) {
    const coinFlipWinner = room.coinFlipWinner ?? room.coinFlipWinnerSeed ?? flipCoinWinner();
    return syncRoomFields({
      ...room,
      coinFlipWinner,
      countdownStartedAt: null,
      countdownEndsAt: null,
      gameState: {
        ...room.gameState,
        phase: "coin_flip",
        actionPhase: "dealer_choice",
        currentTurn: coinFlipWinner
      },
      updatedAt: new Date().toISOString()
    });
  }

  if (["hand_score", "next_round_countdown"].includes(room.gameState.phase) && !room.gameState.winner && room.nextRoundStartsAt && now >= Date.parse(room.nextRoundStartsAt)) {
    return syncRoomFields({
      ...room,
      nextHandStartsAt: null,
      nextRoundStartsAt: null,
      gameState: startHand(room.gameState, { deck }),
      updatedAt: new Date().toISOString()
    });
  }

  return room;
}

export function noRestrictedFields(value, restrictedTerms = []) {
  const restricted = new Set(restrictedTerms.map((term) => term.toLowerCase()));
  const seen = new Set();

  function walk(current) {
    if (!current || typeof current !== "object" || seen.has(current)) return true;
    seen.add(current);

    for (const [key, child] of Object.entries(current)) {
      if (restricted.has(key.toLowerCase())) return false;
      if (!walk(child)) return false;
    }

    return true;
  }

  return walk(value);
}

export function generateRoomCode() {
  let code = "";

  for (let index = 0; index < 5; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }

  return code;
}

export function generateSeatToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function currentTrumpActor(trumpState) {
  if (trumpState.forcedDealerChoice) {
    return trumpState.dealer;
  }

  const order = [otherPlayer(trumpState.dealer), trumpState.dealer];
  const passesThisRound = trumpState.passes.filter((pass) => pass.round === trumpState.round).length;
  return order[passesThisRound % order.length];
}

export function availableTrumpSuits(trumpState) {
  if (!trumpState || trumpState.complete) return [];

  if (trumpState.forcedDealerChoice || trumpState.round === 2) {
    return SUITS.filter((candidate) => candidate !== trumpState.upcardSuit);
  }

  return [trumpState.upcardSuit];
}

function startHand(previousState, { deck = shuffleDeck(createDeck()) } = {}) {
  const dealer = previousState.handNumber === 0
    ? previousState.dealer
    : otherPlayer(previousState.dealer);
  const dealt = deal(deck);
  const trumpState = createTrumpSelection({
    dealer,
    upcardSuit: dealt.upcard.suit,
    mode: previousState.mode
  });

  return {
    modeId: previousState.modeId,
    mode: previousState.mode,
    phase: "playing",
    actionPhase: "selectingTrump",
    score: previousState.score,
    winner: getMatchWinner(previousState.score, previousState.mode.targetScore),
    dealer,
    handNumber: previousState.handNumber + 1,
    hands: {
      player1: [...dealt.hands.player1],
      player2: [...dealt.hands.player2]
    },
    kitty: [...dealt.kitty],
    upcard: dealt.upcard,
    trumpState,
    trumpSuit: null,
    maker: null,
    leader: otherPlayer(dealer),
    currentTurn: currentTrumpActor(trumpState),
    currentTrick: [],
    completedTricks: [],
    tricksWon: { player1: 0, player2: 0 },
    handScore: null,
    handHistory: previousState.handHistory
  };
}

function createWaitingGameState({ mode, modeId }) {
  return {
    modeId,
    mode,
    phase: "waiting_for_players",
    actionPhase: "waiting_for_players",
    score: { player1: 0, player2: 0 },
    winner: null,
    dealer: null,
    handNumber: 0,
    hands: {
      player1: [],
      player2: []
    },
    kitty: [],
    upcard: null,
    trumpState: null,
    trumpSuit: null,
    maker: null,
    leader: null,
    currentTurn: null,
    currentTrick: [],
    completedTricks: [],
    tricksWon: { player1: 0, player2: 0 },
    handScore: null,
    handHistory: []
  };
}

function playCardForRoom(room, player, card) {
  const state = room.gameState;
  const hand = state.hands[player];
  const ledCard = state.currentTrick[0]?.card ?? null;

  if (!isLegalPlay({ hand, card, ledCard, trumpSuit: state.trumpSuit })) {
    throw new Error("Card is not legal for the led suit");
  }

  const hands = {
    ...state.hands,
    [player]: removeCard(hand, card)
  };
  const currentTrick = [...state.currentTrick, { player, card }];

  if (currentTrick.length === 1) {
    return syncRoomFields({
      ...room,
      gameState: {
        ...state,
        hands,
        currentTrick,
        currentTurn: otherPlayer(player)
      },
      updatedAt: new Date().toISOString()
    });
  }

  const winnerPlay = determineTrickWinner(currentTrick, state.trumpSuit);
  const tricksWon = {
    ...state.tricksWon,
    [winnerPlay.player]: state.tricksWon[winnerPlay.player] + 1
  };
  const completedTricks = [
    ...state.completedTricks,
    {
      plays: currentTrick,
      winner: winnerPlay.player
    }
  ];

  if (completedTricks.length === 5) {
    const handScore = scoreHand({ maker: state.maker, tricksWon });
    const score = applyScore(state.score, handScore);
    const winner = getMatchWinner(score, state.mode.targetScore);
    const handSummary = {
      handNumber: state.handNumber,
      maker: state.maker,
      trumpSuit: state.trumpSuit,
      tricksWon,
      handScore,
      score,
      winner
    };
    const nextRoundStartsAt = winner ? null : new Date(Date.now() + NEXT_HAND_DELAY_MS).toISOString();

    return syncRoomFields({
      ...room,
      gameState: {
        ...state,
        hands,
        score,
        winner,
        currentTrick: [],
        completedTricks,
        tricksWon,
        handScore,
        handHistory: [...state.handHistory, handSummary],
        phase: winner ? "match_complete" : "next_round_countdown",
        actionPhase: winner ? "match_complete" : "hand_score",
        currentTurn: null
      },
      nextHandStartsAt: nextRoundStartsAt,
      nextRoundStartsAt,
      updatedAt: new Date().toISOString()
    });
  }

  return syncRoomFields({
    ...room,
    gameState: {
      ...state,
      hands,
      currentTrick: [],
      completedTricks,
      tricksWon,
      leader: winnerPlay.player,
      currentTurn: winnerPlay.player
    },
    updatedAt: new Date().toISOString()
  });
}

function applyDealerPickupIfNeeded(state, trumpState) {
  if (trumpState.round !== 1 || trumpState.trumpSuit !== trumpState.upcardSuit) {
    return state;
  }

  const dealer = trumpState.dealer;
  const dealerHand = state.hands[dealer];
  const pickupHand = [...dealerHand, state.upcard];
  const discardIndex = 0;
  const discarded = pickupHand[discardIndex];

  return {
    ...state,
    hands: {
      ...state.hands,
      [dealer]: pickupHand.filter((_, index) => index !== discardIndex)
    },
    kitty: state.kitty.filter((card) => !cardsEqual(card, state.upcard)),
    dealerPickup: {
      dealer,
      upcard: state.upcard,
      discarded
    }
  };
}

function syncRoomFields(room) {
  const guardedRoom = guardWaitingForPlayers(room);

  return {
    ...guardedRoom,
    tournamentMatch: guardedRoom.tournamentMatch
      ? {
          ...guardedRoom.tournamentMatch,
          status: guardedRoom.gameState.winner ? "complete" : guardedRoom.tournamentMatch.status,
          winner: guardedRoom.gameState.winner ?? guardedRoom.tournamentMatch.winner ?? null
        }
      : null,
    currentTurn: guardedRoom.gameState.currentTurn,
    dealer: guardedRoom.gameState.dealer,
    currentDealer: guardedRoom.gameState.dealer,
    trumpState: guardedRoom.gameState.trumpState,
    score: guardedRoom.gameState.score,
    handHistory: guardedRoom.gameState.handHistory
  };
}

function guardWaitingForPlayers(room) {
  if (room.players.player1 && room.players.player2) return room;

  return {
    ...room,
    coinFlipWinner: null,
    startingPositionChoice: null,
    firstDealer: null,
    countdownStartedAt: null,
    countdownEndsAt: null,
    gameState: {
      ...room.gameState,
      phase: "waiting_for_players",
      actionPhase: "waiting_for_players",
      currentTurn: null,
      dealer: null
    }
  };
}

function maybeStartReadyCountdown(room) {
  if (!bothPlayersConnected(room) || !bothPlayersReady(room)) {
    return syncRoomFields({
      ...room,
      countdownStartedAt: null,
      countdownEndsAt: null,
      gameState: {
        ...room.gameState,
        phase: bothPlayersConnected(room) ? "pregame_settings" : "waiting_for_players",
        actionPhase: bothPlayersConnected(room) ? "pregame_settings" : "waiting_for_players"
      }
    });
  }

  if (room.countdownEndsAt) return room;

  const startedAt = new Date();
  return syncRoomFields({
    ...room,
    countdownStartedAt: startedAt.toISOString(),
    countdownEndsAt: new Date(startedAt.getTime() + READY_COUNTDOWN_MS).toISOString(),
    gameState: {
      ...room.gameState,
      phase: "ready_countdown",
      actionPhase: "ready_countdown",
      currentTurn: null
    }
  });
}

function bothPlayersConnected(room) {
  return Boolean(room.players.player1?.connected && room.players.player2?.connected);
}

function bothPlayersReady(room) {
  return Boolean(room.playerReady?.player1 && room.playerReady?.player2);
}

function ensureStartingDealerChosen(room) {
  if (!room.firstDealer) {
    throw new Error("Coin flip winner must choose dealer or non-dealer first");
  }
}

function ensureBothPlayersSeated(room) {
  if (!room.players.player1 || !room.players.player2) {
    throw new Error("Waiting for Player 2");
  }
}

function sanitizeTournamentMatch(match, state) {
  return {
    tournamentCode: match.tournamentCode,
    matchId: match.matchId,
    round: match.round,
    player1: match.player1
      ? { id: match.player1.id, displayName: match.player1.displayName }
      : null,
    player2: match.player2
      ? { id: match.player2.id, displayName: match.player2.displayName }
      : null,
    status: state.winner ? "complete" : match.status,
    winner: state.winner ?? match.winner ?? null
  };
}

function seatForToken(room, seatToken) {
  if (!seatToken) return null;

  for (const seat of ["player1", "player2"]) {
    if (room.players[seat]?.seatToken === seatToken) {
      return seat;
    }
  }

  return null;
}

function markConnected(room, seat) {
  return syncRoomFields({
    ...room,
    players: {
      ...room.players,
      [seat]: {
        ...room.players[seat],
        connected: true
      }
    },
    updatedAt: new Date().toISOString()
  });
}

function ensureTurn(room, seat) {
  if (room.currentTurn !== seat) {
    throw new Error(`It is ${room.currentTurn}'s turn`);
  }
}

function ensurePhase(gameState, phase) {
  if ((gameState.actionPhase ?? gameState.phase) !== phase) {
    throw new Error(`Expected phase ${phase}`);
  }
}

function ensurePregameOrCountdown(gameState) {
  if (!["pregame_settings", "ready_countdown"].includes(gameState.phase)) {
    throw new Error("Ready is only available before the first hand");
  }
}

function normalizeDisplayName(displayName) {
  const name = String(displayName ?? "").trim();
  if (!name) {
    throw roomError(400, "Enter your name to continue.");
  }
  return name.slice(0, 32);
}

function removeCard(hand, card) {
  const index = hand.findIndex((candidate) => cardsEqual(candidate, card));
  if (index === -1) {
    throw new Error("Card is not in hand");
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function sanitizeTrumpState(trumpState) {
  if (!trumpState) {
    return {
      dealer: null,
      upcardSuit: null,
      round: 1,
      passes: [],
      trumpSuit: null,
      maker: null,
      forcedDealerChoice: false,
      redealRequired: false,
      complete: false
    };
  }

  return {
    dealer: trumpState.dealer,
    upcardSuit: trumpState.upcardSuit,
    round: trumpState.round,
    passes: trumpState.passes,
    trumpSuit: trumpState.trumpSuit,
    maker: trumpState.maker,
    forcedDealerChoice: trumpState.forcedDealerChoice,
    redealRequired: trumpState.redealRequired,
    complete: trumpState.complete
  };
}

function otherPlayer(player) {
  return player === "player1" ? "player2" : "player1";
}

function shuffleDeck(deck) {
  const copy = [...deck];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function roomError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function flipCoinWinner() {
  return Math.random() < 0.5 ? "player1" : "player2";
}
