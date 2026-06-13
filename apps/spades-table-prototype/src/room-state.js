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

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
  return syncRoom({
    roomCode,
    players: {
      player1: {
        seat: "player1",
        seatToken,
        playerId: normalizePlayerId(playerId),
        displayName: normalizeDisplayName(displayName),
        connected: true
      },
      player2: null
    },
    playerReady: {
      player1: false,
      player2: false
    },
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
  });
}

export function joinRoom(room, {
  seatToken,
  playerId,
  displayName = "Player 2"
} = {}) {
  const existingSeat = getViewerSeat(room, { seatToken, playerId });
  if (existingSeat !== "spectator") {
    return {
      room: markConnected(room, existingSeat),
      seat: existingSeat,
      seatToken: room.players[existingSeat].seatToken,
      alreadySeated: true
    };
  }

  const normalizedPlayerId = normalizePlayerId(playerId);
  if (normalizedPlayerId && playerIdMatchesSeatedPlayer(room, normalizedPlayerId)) {
    throw roomError(409, "This player is already seated in this room");
  }

  if (room.players.player2) {
    return {
      room,
      seat: "spectator",
      seatToken: null,
      alreadySeated: false
    };
  }

  const nextSeatToken = seatToken || generateSeatToken();
  return {
    room: syncRoom({
      ...room,
      players: {
        ...room.players,
        player2: {
          seat: "player2",
          seatToken: nextSeatToken,
          playerId: normalizedPlayerId,
          displayName: normalizeDisplayName(displayName),
          connected: true
        }
      },
      updatedAt: new Date().toISOString()
    }),
    seat: "player2",
    seatToken: nextSeatToken,
    alreadySeated: false
  };
}

export function leaveRoom(room, { seatToken, playerId } = {}) {
  const seat = getViewerSeat(room, { seatToken, playerId });
  if (!PLAYERS.includes(seat)) {
    return syncRoom(room);
  }

  return syncRoom({
    ...room,
    players: {
      ...room.players,
      [seat]: {
        ...room.players[seat],
        connected: false
      }
    },
    updatedAt: new Date().toISOString()
  });
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

  if (action.type === "ready") {
    ensurePhase(room, "waiting");
    const nextRoom = syncRoom({
      ...room,
      playerReady: {
        ...room.playerReady,
        [seat]: true
      },
      updatedAt: new Date().toISOString()
    });
    return maybeStartHand(nextRoom);
  }

  if (action.type === "unready") {
    ensurePhase(room, "waiting");
    return syncRoom({
      ...room,
      playerReady: {
        ...room.playerReady,
        [seat]: false
      },
      updatedAt: new Date().toISOString()
    });
  }

  if (action.type === "bid") {
    ensurePhase(room, "bidding");
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

  throw roomError(400, `Unsupported room action: ${action.type}`);
}

export function getViewerSeat(room, { seatToken, playerId } = {}) {
  const normalizedPlayerId = normalizePlayerId(playerId);
  for (const seat of PLAYERS) {
    const player = room.players?.[seat];
    if (!player) continue;
    if (seatToken && player.seatToken === seatToken) return seat;
    if (normalizedPlayerId && player.playerId === normalizedPlayerId) return seat;
  }
  return "spectator";
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
    tricksTaken: {
      ...room.game.tricksTaken
    },
    currentTrick: room.game.currentTrick.map(sanitizePlay),
    lastTrick: room.game.lastTrick,
    spadesBroken: room.game.spadesBroken,
    winner: room.game.winner,
    hiddenHandCounts: hiddenHandCounts(room.game.hands),
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
    spadesBroken: false,
    winner: null
  };
}

function sanitizePlayers(players) {
  return Object.fromEntries(PLAYERS.map((seat) => {
    const player = players?.[seat];
    return [seat, player ? {
      seat,
      displayName: player.displayName,
      connected: player.connected
    } : null];
  }));
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

function hiddenHandCounts(hands) {
  return Object.fromEntries(PLAYERS.map((seat) => [seat, hands?.[seat]?.length ?? 0]));
}

function sanitizePlay(play) {
  return {
    player: play.player,
    card: {
      ...play.card
    }
  };
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
  if (!PLAYERS.includes(seat)) {
    throw roomError(403, "Join this room before taking a player action");
  }
}

function ensurePhase(room, phase) {
  if (room.phase !== phase) {
    throw roomError(409, `Room must be in ${phase} phase`);
  }
}

function otherPlayer(player) {
  return player === "player1" ? "player2" : "player1";
}

function playerIdMatchesSeatedPlayer(room, playerId) {
  return PLAYERS.some((seat) => room.players?.[seat]?.playerId === playerId);
}

function normalizePlayerId(playerId) {
  const value = String(playerId ?? "").trim();
  return value ? value.slice(0, 80) : null;
}

function normalizeActionId(actionId) {
  const value = String(actionId ?? "").trim();
  return value ? value.slice(0, 160) : null;
}

function normalizeDisplayName(displayName) {
  const value = String(displayName ?? "").trim();
  if (!value) {
    throw roomError(400, "Enter a display name");
  }
  return value.slice(0, 32);
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
