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

export function createRoom({
  roomCode = generateRoomCode(),
  seatToken = generateSeatToken(),
  modeId = "communityCompetitive",
  deck = shuffleDeck(createDeck()),
  tournamentMatch = null
} = {}) {
  const mode = GAME_MODES[modeId] ?? GAME_MODES.communityCompetitive;
  const gameState = startHand({
    mode,
    modeId: mode.id,
    score: { player1: 0, player2: 0 },
    dealer: "player2",
    handNumber: 0,
    handHistory: [],
    winner: null
  }, { deck });

  return syncRoomFields({
    roomCode,
    players: {
      player1: {
        seat: "player1",
        seatToken,
        connected: true
      },
      player2: null
    },
    tournamentMatch,
    gameState,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function joinRoom(room, { seatToken = generateSeatToken() } = {}) {
  const existingSeat = seatForToken(room, seatToken);

  if (existingSeat) {
    return {
      room: markConnected(room, existingSeat),
      seat: existingSeat,
      seatToken
    };
  }

  if (!room.players.player2) {
    return {
      room: syncRoomFields({
        ...room,
        players: {
          ...room.players,
          player2: {
            seat: "player2",
            seatToken,
            connected: true
          }
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

export function applyRoomAction(room, { seatToken, type, suit, card, deck }) {
  const seat = seatForToken(room, seatToken);

  if (!seat) {
    throw roomError(403, "Join this room before taking a player action");
  }

  const gameState = room.gameState;

  if (type === "chooseTrump") {
    ensureTurn(room, seat);
    ensurePhase(gameState, "selectingTrump");

    if (!availableTrumpSuits(gameState.trumpState).includes(suit)) {
      throw new Error("Trump suit is not available now");
    }

    const trumpState = chooseTrump(gameState.trumpState, seat, suit);
    return syncRoomFields({
      ...room,
      gameState: {
        ...gameState,
        phase: "playing",
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
    if (!["handComplete", "matchComplete"].includes(gameState.phase)) {
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
  const viewerSeat = getViewerSeat(room, seatToken);
  const state = room.gameState;
  const viewerHand = viewerSeat === "spectator" ? [] : [...state.hands[viewerSeat]];

  return {
    roomCode: room.roomCode,
    viewerSeat,
    players: {
      player1: Boolean(room.players.player1),
      player2: Boolean(room.players.player2)
    },
    tournamentMatch: room.tournamentMatch
      ? sanitizeTournamentMatch(room.tournamentMatch, state)
      : null,
    gameState: {
      phase: state.phase,
      modeId: state.modeId,
      score: state.score,
      targetScore: state.mode.targetScore,
      winner: state.winner,
      currentTurn: state.currentTurn,
      dealer: state.dealer,
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
      playableCards: viewerSeat === state.currentTurn && state.phase === "playing"
        ? getPlayableCards(viewerHand, state.currentTrick[0]?.card ?? null, state.trumpSuit)
        : [],
      currentTrick: state.currentTrick,
      completedTricks: state.completedTricks,
      tricksWon: state.tricksWon,
      handScore: state.handScore,
      handHistory: state.handHistory,
      availableTrumpSuits: state.phase === "selectingTrump" && viewerSeat === state.currentTurn
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
    phase: "selectingTrump",
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
        phase: winner ? "matchComplete" : "handComplete",
        currentTurn: null
      },
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

function syncRoomFields(room) {
  return {
    ...room,
    tournamentMatch: room.tournamentMatch
      ? {
          ...room.tournamentMatch,
          status: room.gameState.winner ? "complete" : room.tournamentMatch.status,
          winner: room.gameState.winner ?? room.tournamentMatch.winner ?? null
        }
      : null,
    currentTurn: room.gameState.currentTurn,
    dealer: room.gameState.dealer,
    trumpState: room.gameState.trumpState,
    score: room.gameState.score,
    handHistory: room.gameState.handHistory
  };
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
  if (gameState.phase !== phase) {
    throw new Error(`Expected phase ${phase}`);
  }
}

function removeCard(hand, card) {
  const index = hand.findIndex((candidate) => cardsEqual(candidate, card));
  if (index === -1) {
    throw new Error("Card is not in hand");
  }

  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function sanitizeTrumpState(trumpState) {
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
