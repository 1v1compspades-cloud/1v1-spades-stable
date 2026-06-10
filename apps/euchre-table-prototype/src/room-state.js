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
  displayName = "Host",
  playerId,
  accountId,
  coinFlipWinner = null,
  tournamentMatch = null,
  matchSettings,
  targetScore,
  raceTo,
  stickTheDealer
} = {}) {
  const settings = resolveMatchSettings({
    modeId,
    matchSettings,
    targetScore,
    raceTo,
    stickTheDealer
  });
  const mode = modeForMatchSettings(settings);
  const gameState = createWaitingGameState({ mode, modeId: settings.modeId });
  const name = normalizeDisplayName(displayName);

  return syncRoomFields({
    roomCode,
    matchSettings: settings,
    players: {
      player1: {
        seat: "player1",
        seatToken,
        playerId: normalizePlayerId(playerId),
        accountId: normalizeAccountId(accountId),
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

export function joinRoom(room, { seatToken, displayName = "Opponent", playerId, accountId, blockedIdentityNames = [] } = {}) {
  const existingSeat = seatForToken(room, seatToken);
  const normalizedAccountId = normalizeAccountId(accountId);

  if (existingSeat) {
    return {
      room: markConnected(room, existingSeat, normalizedAccountId),
      seat: existingSeat,
      seatToken: room.players[existingSeat].seatToken
    };
  }

  const normalizedPlayerId = normalizePlayerId(playerId);

  if (playerIdMatchesSeatedPlayer(room, normalizedPlayerId)) {
    throw roomError(409, "This device is already seated in this room");
  }

  if (accountIdMatchesSeatedPlayer(room, normalizedAccountId)) {
    throw roomError(409, "This account is already seated in this room", "duplicate_seat");
  }

  const name = normalizeDisplayName(displayName);

  if (!name) {
    throw roomError(400, "Enter a player name");
  }

  if (room.players.player2) {
    throw roomError(409, "Room already has two seated players");
  }

  if (displayNameMatchesSeatedPlayer(room, name) || identityNameMatchesList(blockedIdentityNames, name)) {
    throw roomError(409, "This account or name is already seated in this room.", "duplicate_name_or_account");
  }

  const nextSeatToken = seatToken || generateSeatToken();
  return {
    room: syncRoomFields({
      ...room,
      players: {
        ...room.players,
        player2: {
          seat: "player2",
          seatToken: nextSeatToken,
          playerId: normalizedPlayerId,
          accountId: normalizedAccountId,
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
    seatToken: nextSeatToken
  };
}

export function getViewerSeat(room, seatToken, playerId, accountId) {
  return getViewerIdentity(room, normalizeViewerIdentity(seatToken, playerId, accountId)).seat;
}

export function getViewerIdentity(room, { seatToken, playerId, accountId } = {}) {
  const tokenSeat = seatForToken(room, seatToken);
  if (tokenSeat) {
    return {
      seat: tokenSeat,
      seatToken: room.players[tokenSeat].seatToken,
      restoredBy: "seatToken"
    };
  }

  const playerIdSeat = seatForPlayerId(room, playerId);
  if (playerIdSeat) {
    return {
      seat: playerIdSeat,
      seatToken: room.players[playerIdSeat].seatToken,
      restoredBy: "playerId"
    };
  }

  const accountIdSeat = seatForAccountId(room, accountId);
  if (accountIdSeat) {
    return {
      seat: accountIdSeat,
      seatToken: room.players[accountIdSeat].seatToken,
      restoredBy: "accountId"
    };
  }

  return {
    seat: "spectator",
    seatToken: null,
    restoredBy: "spectator"
  };
}

export function applyRoomAction(room, { seatToken, playerId, accountId, type, suit, position, card, deck }) {
  const seat = seatForToken(room, seatToken);

  if (!seat) {
    throw roomError(403, "Join this room before taking a player action");
  }

  ensurePlayerIdentity(room, seat, playerId, accountId);

  const gameState = room.gameState;

  if (type === "ready") {
    ensurePregameOrCountdown(gameState);

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

  if (type === "unready") {
    ensurePregameOrCountdown(gameState);

    const nextReady = {
      ...room.playerReady,
      [seat]: false
    };

    return maybeStartReadyCountdown(syncRoomFields({
      ...room,
      playerReady: nextReady,
      countdownStartedAt: null,
      countdownEndsAt: null,
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
      }, { deck, matchSettings: room.matchSettings }),
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
    const needsDealerDiscard = Boolean(nextState.dealerPickup?.pending);
    return syncRoomFields({
      ...room,
      gameState: {
        ...nextState,
        phase: "playing",
        actionPhase: needsDealerDiscard ? "dealer_discard" : "playing",
        trumpState,
        trumpSuit: trumpState.trumpSuit,
        maker: trumpState.maker,
        currentTurn: needsDealerDiscard ? trumpState.dealer : gameState.leader
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
        }, { deck, matchSettings: room.matchSettings }),
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

  if (type === "discard") {
    ensurePhase(gameState, "dealer_discard");

    if (seat !== gameState.dealer) {
      throw roomError(403, "Only the dealer can discard after picking up the upcard");
    }

    return discardForDealer(room, seat, card);
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
      gameState: startHand(gameState, { deck, matchSettings: room.matchSettings }),
      updatedAt: new Date().toISOString()
    });
  }

  throw new Error(`Unsupported room action: ${type}`);
}

export function sanitizeRoomForViewer(room, seatToken, playerId, accountId) {
  const safeRoom = syncRoomFields(room);
  const viewerIdentity = getViewerIdentity(safeRoom, normalizeViewerIdentity(seatToken, playerId, accountId));
  const viewerSeat = viewerIdentity.seat;
  const alreadySeated = viewerSeat !== "spectator";
  const state = safeRoom.gameState;
  const viewerHand = viewerSeat === "spectator" ? [] : [...state.hands[viewerSeat]];

  return {
    roomCode: safeRoom.roomCode,
    viewerSeat,
    alreadySeated,
    players: {
      player1: Boolean(safeRoom.players.player1),
      player2: Boolean(safeRoom.players.player2)
    },
    playerNames: {
      player1: safeRoom.players.player1?.displayName ?? "Host",
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
    matchSettings: {
      ...safeRoom.matchSettings
    },
    tournamentMatch: safeRoom.tournamentMatch
      ? sanitizeTournamentMatch(safeRoom.tournamentMatch, state)
      : null,
    gameState: {
      phase: state.phase,
      actionPhase: state.actionPhase,
      modeId: state.modeId,
      score: state.score,
      targetScore: safeRoom.matchSettings.raceTo,
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
      dealerPickup: state.dealerPickup
        ? {
            dealer: state.dealerPickup.dealer,
            upcard: state.dealerPickup.upcard,
            pending: Boolean(state.dealerPickup.pending),
            discarded: state.dealerPickup.discarded
              ? viewerSeat === state.dealer ? state.dealerPickup.discarded : "discarded"
              : null
          }
        : null,
      viewerHand,
      handCounts: {
        player1: state.hands.player1.length,
        player2: state.hands.player2.length
      },
      playableCards: viewerSeat === state.currentTurn && state.actionPhase === "playing" && state.trumpSuit
        ? getPlayableCards(viewerHand, state.currentTrick[0]?.card ?? null, state.trumpSuit)
        : [],
      discardableCards: viewerSeat === state.dealer && state.actionPhase === "dealer_discard"
        ? [...viewerHand]
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
      gameState: startHand(room.gameState, { deck, matchSettings: room.matchSettings }),
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

function startHand(previousState, { deck = shuffleDeck(createDeck()), matchSettings } = {}) {
  const settings = resolveMatchSettings({
    modeId: matchSettings?.modeId ?? previousState.modeId,
    raceTo: matchSettings?.raceTo ?? previousState.mode?.targetScore,
    stickTheDealer: matchSettings?.stickTheDealer ?? previousState.mode?.stickTheDealer
  });
  const mode = modeForMatchSettings(settings);
  const dealer = previousState.handNumber === 0
    ? previousState.dealer
    : otherPlayer(previousState.dealer);
  const dealt = deal(deck);
  const trumpState = createTrumpSelection({
    dealer,
    upcardSuit: dealt.upcard.suit,
    mode
  });

  return {
    modeId: settings.modeId,
    mode,
    phase: "playing",
    actionPhase: "selectingTrump",
    score: previousState.score,
    winner: getMatchWinner(previousState.score, settings.raceTo),
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
    dealerPickup: null,
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
    dealerPickup: null,
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
    const winner = getMatchWinner(score, targetScoreForRoom(room));
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

function discardForDealer(room, dealer, card) {
  const state = room.gameState;
  const hand = state.hands[dealer];
  const discarded = card;

  assertDealerPickupPending(state, dealer);

  if (!hand.some((candidate) => cardsEqual(candidate, discarded))) {
    throw new Error("Dealer cannot discard a card they do not hold");
  }

  const dealerHand = removeCard(hand, discarded);
  if (dealerHand.length !== 5) {
    throw new Error("Dealer must discard exactly one card");
  }

  return syncRoomFields({
    ...room,
    gameState: {
      ...state,
      hands: {
        ...state.hands,
        [dealer]: dealerHand
      },
      kitty: [...state.kitty, discarded],
      dealerPickup: {
        ...state.dealerPickup,
        pending: false,
        discarded
      },
      actionPhase: "playing",
      currentTurn: state.leader
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

  return {
    ...state,
    hands: {
      ...state.hands,
      [dealer]: pickupHand
    },
    kitty: state.kitty.filter((card) => !cardsEqual(card, state.upcard)),
    dealerPickup: {
      dealer,
      upcard: state.upcard,
      pending: true,
      discarded: null
    }
  };
}

function syncRoomFields(room) {
  const matchSettings = resolveMatchSettings({
    modeId: room.matchSettings?.modeId ?? room.gameState?.modeId,
    raceTo: room.matchSettings?.raceTo ?? room.gameState?.mode?.targetScore,
    stickTheDealer: room.matchSettings?.stickTheDealer ?? room.gameState?.mode?.stickTheDealer
  });
  const roomWithSettings = {
    ...room,
    matchSettings,
    gameState: normalizeGameStateForMatchSettings(room.gameState, matchSettings)
  };
  const guardedRoom = guardWaitingForPlayers(roomWithSettings);

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

function resolveMatchSettings({
  modeId = "communityCompetitive",
  matchSettings,
  targetScore,
  raceTo,
  stickTheDealer
} = {}) {
  const requestedModeId = matchSettings?.modeId ?? modeId;
  const baseMode = GAME_MODES[requestedModeId] ?? GAME_MODES.communityCompetitive;
  const requestedRaceTo = Number.parseInt(String(
    matchSettings?.raceTo
      ?? matchSettings?.matchTarget
      ?? matchSettings?.targetScore
      ?? matchSettings?.scoreLimit
      ?? matchSettings?.winningScore
      ?? raceTo
      ?? targetScore
      ?? ""
  ), 10);
  const defaultRaceTo = baseMode.id === "fastGame" ? 5 : 10;
  const normalizedRaceTo = [5, 10].includes(requestedRaceTo) ? requestedRaceTo : defaultRaceTo;
  const requestedStickTheDealer = matchSettings?.stickTheDealer ?? stickTheDealer;

  return {
    modeId: baseMode.id,
    raceTo: normalizedRaceTo,
    stickTheDealer: typeof requestedStickTheDealer === "boolean"
      ? requestedStickTheDealer
      : baseMode.stickTheDealer
  };
}

function modeForMatchSettings(matchSettings) {
  const baseMode = GAME_MODES[matchSettings.modeId] ?? GAME_MODES.communityCompetitive;

  return {
    ...baseMode,
    targetScore: matchSettings.raceTo,
    stickTheDealer: matchSettings.stickTheDealer
  };
}

function normalizeGameStateForMatchSettings(gameState, matchSettings) {
  const mode = modeForMatchSettings(matchSettings);

  return {
    ...gameState,
    modeId: matchSettings.modeId,
    mode,
    trumpState: gameState.trumpState
      ? {
          ...gameState.trumpState,
          mode
        }
      : null
  };
}

function targetScoreForRoom(room) {
  return room.matchSettings?.raceTo ?? room.gameState?.mode?.targetScore ?? 10;
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
    throw new Error("Waiting for opponent");
  }
}

function assertDealerPickupPending(state, dealer) {
  if (!state.dealerPickup?.pending || state.dealerPickup.dealer !== dealer) {
    throw new Error("Dealer must pick up the upcard before discarding");
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

function seatForPlayerId(room, playerId) {
  const normalizedPlayerId = normalizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  for (const seat of ["player1", "player2"]) {
    if (room.players[seat]?.playerId === normalizedPlayerId) {
      return seat;
    }
  }

  return null;
}

function seatForAccountId(room, accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return null;

  for (const seat of ["player1", "player2"]) {
    if (room.players[seat]?.accountId === normalizedAccountId) {
      return seat;
    }
  }

  return null;
}

function normalizeViewerIdentity(seatTokenOrIdentity, playerId, accountId) {
  if (seatTokenOrIdentity && typeof seatTokenOrIdentity === "object") {
    return {
      seatToken: seatTokenOrIdentity.seatToken,
      playerId: seatTokenOrIdentity.playerId,
      accountId: seatTokenOrIdentity.accountId
    };
  }

  return {
    seatToken: seatTokenOrIdentity,
    playerId,
    accountId
  };
}

function playerIdMatchesSeatedPlayer(room, playerId) {
  const normalizedPlayerId = normalizePlayerId(playerId);
  if (!normalizedPlayerId) return false;

  return ["player1", "player2"].some((seat) => room.players[seat]?.playerId === normalizedPlayerId);
}

function accountIdMatchesSeatedPlayer(room, accountId) {
  return Boolean(seatForAccountId(room, accountId));
}

function displayNameMatchesSeatedPlayer(room, displayName) {
  const normalizedName = normalizeIdentityName(displayName);
  if (!normalizedName) return false;

  return ["player1", "player2"].some((seat) => {
    const seatedDisplayName = room.players[seat]?.displayName;
    if (!seatedDisplayName) return false;

    const seatedName = normalizeIdentityName(seatedDisplayName);
    return seatedName === normalizedName;
  });
}

function identityNameMatchesList(identityNames, displayName) {
  const normalizedName = normalizeIdentityName(displayName);
  if (!normalizedName) return false;
  return identityNames.some((identityName) => normalizeIdentityName(identityName) === normalizedName);
}

function ensurePlayerIdentity(room, seat, playerId, accountId) {
  const expectedPlayerId = room.players[seat]?.playerId;
  if (expectedPlayerId) {
    const providedPlayerId = normalizePlayerId(playerId);
    if (!providedPlayerId || providedPlayerId !== expectedPlayerId) {
      throw roomError(403, "Player identity does not match this seat");
    }
  }

  const expectedAccountId = room.players[seat]?.accountId;
  const providedAccountId = normalizeAccountId(accountId);
  if (expectedAccountId && providedAccountId && providedAccountId !== expectedAccountId) {
    throw roomError(403, "Account identity does not match this seat");
  }
}

function markConnected(room, seat, accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  const player = room.players[seat];
  const accountSeat = seatForAccountId(room, normalizedAccountId);

  if (accountSeat && accountSeat !== seat) {
    throw roomError(409, "This account is already seated in this room");
  }

  if (player.accountId && normalizedAccountId && player.accountId !== normalizedAccountId) {
    throw roomError(403, "Account identity does not match this seat");
  }

  return syncRoomFields({
    ...room,
    players: {
      ...room.players,
      [seat]: {
        ...player,
        accountId: player.accountId ?? normalizedAccountId,
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
  if (!["waiting_for_players", "pregame_settings", "ready_countdown"].includes(gameState.phase)) {
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

function normalizeIdentityName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePlayerId(playerId) {
  const id = String(playerId ?? "").trim();
  return id ? id.slice(0, 120) : null;
}

function normalizeAccountId(accountId) {
  const id = String(accountId ?? "").trim();
  return id ? id.slice(0, 80) : null;
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

function roomError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function flipCoinWinner() {
  return Math.random() < 0.5 ? "player1" : "player2";
}
