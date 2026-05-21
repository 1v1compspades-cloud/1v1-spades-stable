import {
  Card,
  Suit,
  createDeck,
  shuffleDeck,
  dealHands,
  determineTrickWinner,
  sortHand,
} from "./deck.js";

export type GamePhase =
  | "waiting"
  | "bidding"
  | "playing"
  | "round_over"
  | "game_over";

export interface Player {
  id: string;
  name: string;
  socketId: string;
  index: 0 | 1;
}

export interface Bid {
  playerIndex: 0 | 1;
  amount: number;
}

export interface TrickCard {
  card: Card;
  playerIndex: 0 | 1;
}

export interface RoundScore {
  round: number;
  scores: [number, number];
  bags: [number, number];
  bids: [number, number];
  tricks: [number, number];
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: (Player | null)[];
  hands: [Card[], Card[]];
  bids: (number | null)[];
  currentBidder: 0 | 1 | null;
  tricks: [number, number];
  currentTrick: TrickCard[];
  leadPlayerIndex: 0 | 1;
  currentTurnIndex: 0 | 1 | null;
  spadesBroken: boolean;
  scores: [number, number];
  bags: [number, number];
  roundHistory: RoundScore[];
  roundNumber: number;
  trickLeader: 0 | 1;
}

function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createGame(roomCode: string): GameState {
  return {
    roomCode,
    phase: "waiting",
    players: [null, null],
    hands: [[], []],
    bids: [null, null],
    currentBidder: null,
    tricks: [0, 0],
    currentTrick: [],
    leadPlayerIndex: 0,
    currentTurnIndex: null,
    spadesBroken: false,
    scores: [0, 0],
    bags: [0, 0],
    roundHistory: [],
    roundNumber: 0,
    trickLeader: 0,
  };
}

export function startRound(state: GameState): GameState {
  const deck = shuffleDeck(createDeck());
  const [hand1, hand2] = dealHands(deck);
  const newState: GameState = {
    ...state,
    phase: "bidding",
    hands: [sortHand(hand1), sortHand(hand2)],
    bids: [null, null],
    currentBidder: 0,
    tricks: [0, 0],
    currentTrick: [],
    spadesBroken: false,
    currentTurnIndex: null,
    roundNumber: state.roundNumber + 1,
  };
  return newState;
}

export function placeBid(
  state: GameState,
  playerIndex: 0 | 1,
  amount: number
): { state: GameState; bothBid: boolean } {
  if (state.currentBidder !== playerIndex) {
    throw new Error("Not your turn to bid");
  }
  if (amount < 0 || amount > 13) {
    throw new Error("Invalid bid amount");
  }

  const newBids = [...state.bids] as (number | null)[];
  newBids[playerIndex] = amount;

  const otherIndex = playerIndex === 0 ? 1 : 0;
  const bothBid = newBids[otherIndex] !== null;

  const newState: GameState = {
    ...state,
    bids: newBids,
    currentBidder: bothBid ? null : (otherIndex as 0 | 1),
    phase: bothBid ? "playing" : "bidding",
    currentTurnIndex: bothBid ? 0 : null,
    trickLeader: 0,
  };

  return { state: newState, bothBid };
}

export function canPlayCard(
  state: GameState,
  playerIndex: 0 | 1,
  card: Card
): { ok: boolean; reason?: string } {
  if (state.phase !== "playing") return { ok: false, reason: "Not in playing phase" };
  if (state.currentTurnIndex !== playerIndex)
    return { ok: false, reason: "Not your turn" };

  const hand = state.hands[playerIndex];
  const hasCard = hand.some(
    (c) => c.suit === card.suit && c.rank === card.rank
  );
  if (!hasCard) return { ok: false, reason: "Card not in hand" };

  if (state.currentTrick.length === 0) {
    // Leading a trick
    if (card.suit === "spades" && !state.spadesBroken) {
      const hasNonSpade = hand.some((c) => c.suit !== "spades");
      if (hasNonSpade) {
        return { ok: false, reason: "Spades not broken yet" };
      }
    }
    return { ok: true };
  }

  // Following a trick
  const ledSuit = state.currentTrick[0].card.suit;
  const hasLedSuit = hand.some((c) => c.suit === ledSuit);
  if (hasLedSuit && card.suit !== ledSuit) {
    return { ok: false, reason: `Must follow ${ledSuit}` };
  }

  return { ok: true };
}

export interface PlayCardResult {
  /** Final settled state: trick cleared, winner leads (or round/game over). */
  state: GameState;
  /**
   * Intermediate display state: both trick cards still visible,
   * currentTurnIndex = null so nobody can play. Exists only when a trick
   * just completed. The caller should store this in the room first, then
   * after the display delay swap in `state`.
   */
  intermediateState?: GameState;
  trickComplete: boolean;
  trickWinner?: 0 | 1;
  roundComplete?: boolean;
  roundScores?: { scores: [number, number]; bags: [number, number] };
}

export function playCard(
  state: GameState,
  playerIndex: 0 | 1,
  card: Card
): PlayCardResult {
  const check = canPlayCard(state, playerIndex, card);
  if (!check.ok) throw new Error(check.reason);

  const newHands = [
    [...state.hands[0]],
    [...state.hands[1]],
  ] as [Card[], Card[]];
  newHands[playerIndex] = newHands[playerIndex].filter(
    (c) => !(c.suit === card.suit && c.rank === card.rank)
  );

  const newTrick: TrickCard[] = [
    ...state.currentTrick,
    { card, playerIndex },
  ];

  let newState: GameState = {
    ...state,
    hands: newHands,
    currentTrick: newTrick,
    spadesBroken: state.spadesBroken || card.suit === "spades",
  };

  if (newTrick.length < 2) {
    // Trick not complete yet — advance turn
    const otherIndex = playerIndex === 0 ? 1 : 0;
    newState = { ...newState, currentTurnIndex: otherIndex as 0 | 1 };
    return { state: newState, trickComplete: false };
  }

  // Trick is complete — determine winner
  const winnerIndex = determineTrickWinner(
    newTrick.map((tc) => ({ card: tc.card, playerIndex: tc.playerIndex }))
  ) as 0 | 1;

  const newTricks = [...state.tricks] as [number, number];
  newTricks[winnerIndex]++;

  const roundComplete = newHands[0].length === 0 && newHands[1].length === 0;

  // Intermediate display state: both cards visible, nobody can play.
  // tricks/trickLeader are already updated so score counters stay correct.
  const intermediateState: GameState = {
    ...newState,
    hands: newHands,
    currentTrick: newTrick,   // keep cards on table
    tricks: newTricks,
    trickLeader: winnerIndex,
    currentTurnIndex: null,   // blocks any play_card during the display window
  };

  if (roundComplete) {
    const roundResult = calculateRoundScore(state, newTricks);
    const newScores: [number, number] = [
      state.scores[0] + roundResult.scoreDeltas[0],
      state.scores[1] + roundResult.scoreDeltas[1],
    ];
    const newBags: [number, number] = [
      roundResult.newBags[0],
      roundResult.newBags[1],
    ];

    // Deduct 100 for every 10 bags
    const finalScores: [number, number] = [
      newScores[0] - (Math.floor(newBags[0] / 10) - Math.floor(state.bags[0] / 10)) * 100,
      newScores[1] - (Math.floor(newBags[1] / 10) - Math.floor(state.bags[1] / 10)) * 100,
    ];

    const roundHistory: RoundScore = {
      round: state.roundNumber,
      scores: [roundResult.scoreDeltas[0], roundResult.scoreDeltas[1]],
      bags: newBags,
      bids: [state.bids[0] as number, state.bids[1] as number],
      tricks: newTricks,
    };

    const isGameOver =
      (finalScores[0] >= 500 || finalScores[1] >= 500) ||
      (finalScores[0] <= -200 || finalScores[1] <= -200);

    const finalState: GameState = {
      ...intermediateState,
      currentTrick: [],
      scores: finalScores,
      bags: newBags,
      phase: isGameOver ? "game_over" : "round_over",
      currentTurnIndex: null,
      roundHistory: [...state.roundHistory, roundHistory],
    };

    return {
      state: finalState,
      intermediateState,
      trickComplete: true,
      trickWinner: winnerIndex,
      roundComplete: true,
      roundScores: { scores: finalScores, bags: newBags },
    };
  }

  const finalState: GameState = {
    ...intermediateState,
    currentTrick: [],
    currentTurnIndex: winnerIndex,
  };

  return {
    state: finalState,
    intermediateState,
    trickComplete: true,
    trickWinner: winnerIndex,
  };
}

function calculateRoundScore(
  state: GameState,
  tricks: [number, number]
): {
  scoreDeltas: [number, number];
  newBags: [number, number];
} {
  const scoreDeltas: [number, number] = [0, 0];
  const newBags: [number, number] = [...state.bags] as [number, number];

  for (let i = 0; i < 2; i++) {
    const bid = state.bids[i] as number;
    const tricksTaken = tricks[i];

    if (bid === 0) {
      // Nil bid
      if (tricksTaken === 0) {
        scoreDeltas[i] = 100;
      } else {
        scoreDeltas[i] = -100;
        newBags[i] += tricksTaken;
      }
    } else {
      if (tricksTaken >= bid) {
        scoreDeltas[i] = bid * 10;
        const overtricks = tricksTaken - bid;
        scoreDeltas[i] += overtricks;
        newBags[i] += overtricks;
      } else {
        scoreDeltas[i] = -(bid * 10);
      }
    }
  }

  return { scoreDeltas, newBags };
}

// Room management
const rooms = new Map<string, GameState>();

export function createRoom(hostPlayerName: string, hostSocketId: string): GameState {
  let code: string;
  do {
    code = makeRoomCode();
  } while (rooms.has(code));

  const state = createGame(code);
  const host: Player = {
    id: hostSocketId,
    name: hostPlayerName,
    socketId: hostSocketId,
    index: 0,
  };
  state.players[0] = host;
  rooms.set(code, state);
  return state;
}

export function joinRoom(
  roomCode: string,
  playerName: string,
  socketId: string
): { state: GameState; playerIndex: 0 | 1 } {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  if (state.phase !== "waiting") throw new Error("Game already started");
  if (state.players[1] !== null) throw new Error("Room is full");

  const joiner: Player = {
    id: socketId,
    name: playerName,
    socketId,
    index: 1,
  };
  state.players[1] = joiner;
  rooms.set(roomCode, state);
  return { state, playerIndex: 1 };
}

export function getRoom(roomCode: string): GameState | undefined {
  return rooms.get(roomCode);
}

export function updateRoom(state: GameState): void {
  rooms.set(state.roomCode, state);
}

export function removePlayerFromRoom(socketId: string): GameState | null {
  for (const [, state] of rooms) {
    for (let i = 0; i < state.players.length; i++) {
      if (state.players[i]?.socketId === socketId) {
        // Null out the slot but preserve phase — reconnectPlayer will restore the seat.
        // We intentionally do NOT set phase = "game_over" so the room stays recoverable.
        state.players[i] = null;
        return state;
      }
    }
  }
  return null;
}

export function getRoomBySocketId(socketId: string): GameState | null {
  for (const [, state] of rooms) {
    for (const player of state.players) {
      if (player?.socketId === socketId) {
        return state;
      }
    }
  }
  return null;
}

export function cleanupRoom(roomCode: string): void {
  rooms.delete(roomCode);
}

export function reconnectPlayer(
  roomCode: string,
  playerIndex: 0 | 1,
  newSocketId: string,
  playerName: string
): GameState {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");

  const player = state.players[playerIndex];
  if (!player) {
    // Slot was cleared (e.g. opponent disconnected us) — restore it
    state.players[playerIndex] = {
      id: newSocketId,
      name: playerName,
      socketId: newSocketId,
      index: playerIndex,
    };
  } else {
    // Update socketId to the new connection
    player.socketId = newSocketId;
    player.id = newSocketId;
  }

  rooms.set(roomCode, state);
  return state;
}
