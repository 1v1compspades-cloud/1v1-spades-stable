import {
  DEFAULT_MATCH_SETTINGS,
  PLAYERS,
  cardsEqual,
  createBiddingState,
  createDeck,
  deal,
  determineTrickWinner,
  getMatchWinner,
  isLegalPlay,
  nextSpadesBroken,
  placeBid,
  scoreHand
} from "../../../packages/spades-core/src/index.js";
import { createTwoPlayerRoomLifecycle as createShellLifecycle } from "../../../packages/game-shell-core/src/index.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const roomLifecycle = createShellLifecycle({
  seats: PLAYERS,
  generateSeatToken,
  syncRoom
});

export function createRoom({
  roomCode = generateRoomCode(),
  seatToken = generateSeatToken(),
  playerId,
  displayName = "Player 1",
  matchSettings = DEFAULT_MATCH_SETTINGS,
  coinFlipWinner = null,
  deck = null,
  now = new Date().toISOString()
} = {}) {
  return roomLifecycle.createRoomShell({
    roomCode,
    seatToken,
    playerId,
    displayName,
    extra: {
      matchSettings: {
        ...DEFAULT_MATCH_SETTINGS,
        ...matchSettings
      },
      coinFlipWinnerSeed: coinFlipWinner,
      coinFlipWinner: null,
      dealer: null,
      firstPlayer: null,
      currentTurn: null,
      phase: "waiting",
      handNumber: 0,
      game: createEmptyGameState(),
      appliedActionIds: [],
      pendingDeck: deck,
      createdAt: now,
      updatedAt: now
    }
  });
}

export function joinRoom(room, {
  seatToken,
  playerId,
  displayName = "Player 2"
} = {}) {
  return roomLifecycle.joinRoomShell(room, { seatToken, playerId, displayName });
}

export function leaveRoom(room, { seatToken, playerId } = {}) {
  return roomLifecycle.leaveRoomShell(room, { seatToken, playerId });
}

export function applyRoomAction(room, action = {}) {
  const actionId = normalizeActionId(action.actionId);
  if (actionId && room.appliedActionIds?.includes(actionId)) {
    return room;
  }

  const nextRoom = applyRoomActionOnce(room, action);
  return actionId ? recordAppliedAction(nextRoom, actionId) : nextRoom;
}

export function createActionId({ roomCode, seat, type, sequence } = {}) {
  const parts = [roomCode, seat, type, sequence].map((part) => String(part ?? "").trim());
  if (parts.some((part) => !part)) {
    throw roomError(400, "Action id requires roomCode, seat, type, and sequence");
  }
  return parts.join(":");
}

function applyRoomActionOnce(room, action = {}) {
  const seat = getViewerSeat(room, action);
  ensureSeated(seat);
  ensureExpectedPhase(room, action.expectedPhase);
  ensureExpectedTurn(room, action.expectedTurn);

  if (action.type === "ready") {
    ensurePhase(room, "waiting");
    const nextRoom = roomLifecycle.markReady(room, seat, true);
    return maybeStartHand(nextRoom);
  }

  if (action.type === "unready") {
    ensurePhase(room, "waiting");
    return roomLifecycle.markReady(room, seat, false);
  }

  if (action.type === "bid") {
    ensurePhase(room, "bidding");
    ensureBidTurn(room, seat);
    const bidding = placeBid(room.game.bidding, seat, action.bid);
    const nextGame = {
      ...room.game,
      bidding,
      bids: bidding.bids,
      phase: bidding.complete ? "playing" : "bidding"
    };

    return syncRoom({
      ...room,
      phase: nextGame.phase,
      currentTurn: bidding.complete ? room.firstPlayer : room.currentTurn,
      game: nextGame,
      updatedAt: new Date().toISOString()
    });
  }

  if (action.type === "playCard") {
    return playCard(room, seat, action.card);
  }

  if (action.type === "startNextHand") {
    ensurePhase(room, "hand_complete");
    return startNextHand(room, { deck: action.deck });
  }

  if (action.type === "startNewMatch") {
    ensurePhase(room, "match_complete");
    return startNewMatch(room, { deck: action.deck });
  }

  throw roomError(400, `Unsupported room action: ${action.type}`);
}

export function getViewerSeat(room, { seatToken, playerId } = {}) {
  return roomLifecycle.getViewerSeat(room, { seatToken, playerId });
}

export function sanitizeRoomForViewer(room, viewer = {}) {
  const viewerSeat = getViewerSeat(room, viewer);
  const alreadySeated = PLAYERS.includes(viewerSeat);

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    viewerSeat,
    alreadySeated,
    players: sanitizePlayers(room.players),
    playerReady: {
      ...room.playerReady
    },
    matchSettings: {
      ...room.matchSettings
    },
    coinFlipWinner: room.coinFlipWinner,
    dealer: room.dealer,
    firstPlayer: room.firstPlayer,
    currentTurn: room.currentTurn,
    handNumber: room.handNumber,
    appliedActionCount: room.appliedActionIds?.length ?? 0,
    score: {
      ...room.game.score
    },
    bags: {
      ...room.game.bags
    },
    bids: sanitizeBids(room.game.bids, room.phase),
    biddingStatus: biddingStatus(room),
    handSummary: handSummary(room),
    tricksTaken: {
      ...room.game.tricksTaken
    },
    currentPlayerStatus: currentPlayerStatus(room, viewerSeat),
    currentTrick: room.game.currentTrick.map(sanitizePlay),
    lastTrick: room.game.lastTrick,
    spadesBroken: room.game.spadesBroken,
    winner: room.game.winner,
    hiddenHandCounts: hiddenHandCounts(room.game.hands),
    playableCardStatus: playableCardStatus(room, viewerSeat),
    hand: alreadySeated ? [...(room.game.hands?.[viewerSeat] ?? [])] : []
  };
}

function maybeStartHand(room) {
  if (!room.players.player1 || !room.players.player2) return room;
  if (!room.playerReady.player1 || !room.playerReady.player2) return room;

  const coinFlipWinner = room.coinFlipWinnerSeed ?? "player1";
  const dealer = coinFlipWinner;
  const firstPlayer = otherPlayer(dealer);
  const dealt = deal(room.pendingDeck ?? createDeck());
  const handNumber = room.handNumber + 1;

  return syncRoom({
    ...room,
    coinFlipWinner,
    dealer,
    firstPlayer,
    currentTurn: firstPlayer,
    phase: "bidding",
    handNumber,
    game: {
      ...createEmptyGameState(),
      phase: "bidding",
      hands: dealt.hands,
      stock: dealt.stock,
      score: {
        ...room.game.score
      },
      bags: {
        ...room.game.bags
      }
    },
    pendingDeck: null,
    updatedAt: new Date().toISOString()
  });
}

function startNextHand(room, { deck = null } = {}) {
  const dealer = otherPlayer(room.dealer ?? "player2");
  const firstPlayer = otherPlayer(dealer);
  const dealt = deal(deck ?? room.pendingDeck ?? createDeck());
  const handNumber = room.handNumber + 1;

  return syncRoom({
    ...room,
    dealer,
    firstPlayer,
    currentTurn: firstPlayer,
    phase: "bidding",
    handNumber,
    game: {
      ...createEmptyGameState(),
      phase: "bidding",
      hands: dealt.hands,
      stock: dealt.stock,
      score: {
        ...room.game.score
      },
      bags: {
        ...room.game.bags
      }
    },
    pendingDeck: null,
    updatedAt: new Date().toISOString()
  });
}

function startNewMatch(room, { deck = null } = {}) {
  return roomLifecycle.resetForNewMatch(room, {
    coinFlipWinner: null,
    dealer: null,
    firstPlayer: null,
    currentTurn: null,
    phase: "waiting",
    handNumber: 0,
    game: createEmptyGameState(),
    appliedActionIds: [],
    pendingDeck: deck,
  });
}

function playCard(room, seat, card) {
  ensurePhase(room, "playing");
  if (room.currentTurn !== seat) {
    throw roomError(403, "It is not this player's turn");
  }

  const hand = room.game.hands?.[seat] ?? [];
  if (!isLegalPlay({
    hand,
    card,
    currentTrick: room.game.currentTrick,
    spadesBroken: room.game.spadesBroken
  })) {
    throw roomError(400, "Illegal Spades play");
  }

  const currentTrick = [...room.game.currentTrick, { player: seat, card }];
  const hands = {
    ...room.game.hands,
    [seat]: hand.filter((candidate) => !cardsEqual(candidate, card))
  };
  const spadesBroken = nextSpadesBroken({
    currentTrick: room.game.currentTrick,
    card,
    spadesBroken: room.game.spadesBroken
  });

  if (currentTrick.length < 2) {
    return syncRoom({
      ...room,
      currentTurn: otherPlayer(seat),
      game: {
        ...room.game,
        hands,
        currentTrick,
        spadesBroken
      },
      updatedAt: new Date().toISOString()
    });
  }

  const trickWinner = determineTrickWinner(currentTrick);
  const tricksTaken = {
    ...room.game.tricksTaken,
    [trickWinner]: room.game.tricksTaken[trickWinner] + 1
  };
  const lastTrick = {
    winner: trickWinner,
    plays: currentTrick.map(sanitizePlay)
  };
  const trickHistory = [...room.game.trickHistory, lastTrick];
  const handComplete = PLAYERS.every((player) => hands[player].length === 0);

  if (!handComplete) {
    return syncRoom({
      ...room,
      currentTurn: trickWinner,
      game: {
        ...room.game,
        hands,
        currentTrick: [],
        trickHistory,
        lastTrick,
        tricksTaken,
        spadesBroken
      },
      updatedAt: new Date().toISOString()
    });
  }

  const scoring = scoreHand({
    bids: room.game.bids,
    tricksTaken,
    score: room.game.score,
    bags: room.game.bags,
    settings: room.matchSettings
  });
  const previousScore = {
    ...room.game.score
  };
  const winner = getMatchWinner({
    score: scoring.score,
    targetScore: room.matchSettings.targetScore
  });
  const nextPhase = winner ? "match_complete" : "hand_complete";

  return syncRoom({
    ...room,
    phase: nextPhase,
    currentTurn: null,
    game: {
      ...room.game,
      phase: nextPhase,
      hands,
      currentTrick: [],
      trickHistory,
      lastTrick,
      tricksTaken,
      spadesBroken,
      score: scoring.score,
      bags: scoring.bags,
      handScores: scoring.handScores,
      bagPenalties: scoring.bagPenalties,
      previousScore,
      winner
    },
    updatedAt: new Date().toISOString()
  });
}

function createEmptyGameState() {
  return {
    phase: "waiting",
    hands: {
      player1: [],
      player2: []
    },
    stock: [],
    bidding: createBiddingState(),
    bids: {
      player1: null,
      player2: null
    },
    currentTrick: [],
    trickHistory: [],
    lastTrick: null,
    tricksTaken: {
      player1: 0,
      player2: 0
    },
    score: {
      player1: 0,
      player2: 0
    },
    bags: {
      player1: 0,
      player2: 0
    },
    handScores: {
      player1: 0,
      player2: 0
    },
    bagPenalties: {
      player1: 0,
      player2: 0
    },
    previousScore: {
      player1: 0,
      player2: 0
    },
    spadesBroken: false,
    winner: null
  };
}

function sanitizePlayers(players) {
  return roomLifecycle.sanitizePlayers(players);
}

function sanitizeBids(bids, phase) {
  if (["waiting", "bidding"].includes(phase)) {
    return Object.fromEntries(PLAYERS.map((seat) => [seat, bids?.[seat] === null || bids?.[seat] === undefined ? null : "locked"]));
  }

  return {
    player1: bids?.player1 ?? null,
    player2: bids?.player2 ?? null
  };
}

function biddingStatus(room) {
  const bids = room.game.bids;
  const bidOrder = PLAYERS;
  const nextBidder = room.phase === "bidding"
    ? bidOrder.find((seat) => bids?.[seat] === null || bids?.[seat] === undefined) ?? null
    : null;

  return {
    nextBidder,
    complete: Boolean(bids?.player1 !== null && bids?.player1 !== undefined && bids?.player2 !== null && bids?.player2 !== undefined),
    locked: {
      player1: bids?.player1 !== null && bids?.player1 !== undefined,
      player2: bids?.player2 !== null && bids?.player2 !== undefined
    }
  };
}

function handSummary(room) {
  if (!["hand_complete", "match_complete"].includes(room.phase)) {
    return null;
  }

  const players = Object.fromEntries(PLAYERS.map((player) => {
    const bid = room.game.bids[player];
    const tricks = room.game.tricksTaken[player];
    const nilBid = bid === 0;
    return [player, {
      bid,
      tricks,
      bags: room.game.bags[player],
      nilBid,
      nilResult: nilBid ? (tricks === 0 ? "made" : "failed") : null,
      handScore: room.game.handScores[player],
      bagPenalty: room.game.bagPenalties[player],
      scoreChange: room.game.score[player] - room.game.previousScore[player],
      totalScore: room.game.score[player]
    }];
  }));

  return {
    players,
    handWinner: room.game.score.player1 === room.game.score.player2
      ? null
      : (room.game.score.player1 > room.game.score.player2 ? "player1" : "player2"),
    matchWinner: room.game.winner
  };
}

function hiddenHandCounts(hands) {
  return Object.fromEntries(PLAYERS.map((seat) => [seat, hands?.[seat]?.length ?? 0]));
}

function currentPlayerStatus(room, viewerSeat) {
  return {
    currentPlayer: room.currentTurn,
    viewerSeat,
    isViewerTurn: PLAYERS.includes(viewerSeat) && room.currentTurn === viewerSeat,
    canAct: room.phase === "playing" && PLAYERS.includes(viewerSeat) && room.currentTurn === viewerSeat
  };
}

function playableCardStatus(room, viewerSeat) {
  if (room.phase !== "playing" || !PLAYERS.includes(viewerSeat)) {
    return {
      count: 0,
      cardIds: []
    };
  }

  const hand = room.game.hands?.[viewerSeat] ?? [];
  const cardIds = hand
    .filter((card) => isLegalPlay({
      hand,
      card,
      currentTrick: room.game.currentTrick,
      spadesBroken: room.game.spadesBroken
    }))
    .map(cardId);

  return {
    count: cardIds.length,
    cardIds
  };
}

function sanitizePlay(play) {
  return {
    player: play.player,
    card: {
      ...play.card
    }
  };
}

function cardId(card) {
  return `${card.rank}-${card.suit}`;
}

function markConnected(room, seat) {
  return syncRoom({
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

function recordAppliedAction(room, actionId) {
  return syncRoom({
    ...room,
    appliedActionIds: [...(room.appliedActionIds ?? []), actionId]
  });
}

function syncRoom(room) {
  return {
    ...room,
    phase: room.game?.phase ?? room.phase,
    appliedActionIds: room.appliedActionIds ?? []
  };
}

function ensureSeated(seat) {
  if (!roomLifecycle.isPlayerSeat(seat)) {
    throw roomError(403, "Join this room before taking a player action");
  }
}

function ensurePhase(room, phase) {
  if (room.phase !== phase) {
    throw roomError(409, `Room must be in ${phase} phase`);
  }
}

function ensureExpectedPhase(room, expectedPhase) {
  if (expectedPhase && room.phase !== expectedPhase) {
    throw roomError(409, `Stale action expected ${expectedPhase} phase`);
  }
}

function ensureExpectedTurn(room, expectedTurn) {
  if (expectedTurn && room.currentTurn !== expectedTurn) {
    throw roomError(409, `Stale action expected ${expectedTurn} turn`);
  }
}

function ensureBidTurn(room, seat) {
  const nextBidder = PLAYERS.find((player) => (
    room.game.bids?.[player] === null || room.game.bids?.[player] === undefined
  ));
  if (nextBidder && seat !== nextBidder) {
    throw roomError(403, "It is not this player's bid turn");
  }
}

function otherPlayer(player) {
  return player === "player1" ? "player2" : "player1";
}

function normalizeActionId(actionId) {
  const value = String(actionId ?? "").trim();
  return value ? value.slice(0, 160) : null;
}

function generateRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join("");
}

function generateSeatToken() {
  return `seat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function roomError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
