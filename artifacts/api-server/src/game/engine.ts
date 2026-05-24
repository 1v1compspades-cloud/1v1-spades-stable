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
  | "coin_toss"
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

export interface Spectator {
  id: string;
  name: string;
  socketId: string;
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
  matchTarget: number;
  tiebreakerActive: boolean;
  tiebreakerRound: number;
  spectators: Spectator[];
  /**
   * The most recent card played by either player in this match.
   * Null until the first card is played; cleared on resetMatch.
   * Persists across tricks and rounds.
   */
  lastCardPlayed: TrickCard | null;
  /** Optional free-text label for the match (e.g. "Quarterfinal 1", "Finals"). */
  matchLabel?: string;
  /**
   * Coin toss winner (0 or 1) — set ONCE at the start of the match.
   * The winner bids SECOND in Round 1; the loser bids FIRST.
   * Bidding order then alternates every round.
   */
  coinFlipWinner: 0 | 1 | null;
  /**
   * The seat (0 or 1) that bids first in Round 1. Always = the coin toss loser.
   * Stored explicitly so `getFirstBidderForRound` can derive each round's
   * first bidder by simple parity, without re-flipping.
   */
  firstBidderRound1: 0 | 1 | null;
}

function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createGame(roomCode: string, matchTarget = 250, matchLabel?: string): GameState {
  return {
    roomCode,
    phase: "waiting",
    matchLabel,
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
    matchTarget,
    tiebreakerActive: false,
    tiebreakerRound: 0,
    spectators: [],
    lastCardPlayed: null,
    coinFlipWinner: null,
    firstBidderRound1: null,
  };
}

/**
 * Flip the coin ONCE at the start of a match. The winner bids second in
 * Round 1; the loser bids first. Subsequent rounds alternate via
 * {@link getFirstBidderForRound}. Idempotent: re-calling preserves the result.
 */
export function performCoinToss(state: GameState): GameState {
  if (state.coinFlipWinner !== null && state.firstBidderRound1 !== null) {
    // Coin already tossed for this match — preserve it.
    return { ...state, phase: "coin_toss" };
  }
  const winner: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  const loser: 0 | 1 = winner === 0 ? 1 : 0;
  return {
    ...state,
    phase: "coin_toss",
    coinFlipWinner: winner,
    firstBidderRound1: loser,
  };
}

/**
 * Returns the seat (0 or 1) that bids first for the round being started next.
 * Round 1 → firstBidderRound1; then alternates. `nextRoundNumber` is the
 * upcoming roundNumber (1-indexed).
 */
export function getFirstBidderForRound(
  state: GameState,
  nextRoundNumber: number
): 0 | 1 {
  // Defensive default: if coin toss wasn't run, seat 0 bids first.
  if (state.firstBidderRound1 === null) return 0;
  const roundIsOdd = nextRoundNumber % 2 === 1;
  if (roundIsOdd) return state.firstBidderRound1;
  return state.firstBidderRound1 === 0 ? 1 : 0;
}

export function startRound(state: GameState): GameState {
  const deck = shuffleDeck(createDeck());
  const [hand1, hand2] = dealHands(deck);
  const nextRoundNumber = state.roundNumber + 1;
  const firstBidder = getFirstBidderForRound(state, nextRoundNumber);
  const newState: GameState = {
    ...state,
    phase: "bidding",
    hands: [sortHand(hand1), sortHand(hand2)],
    bids: [null, null],
    currentBidder: firstBidder,
    tricks: [0, 0],
    currentTrick: [],
    spadesBroken: false,
    currentTurnIndex: null,
    roundNumber: nextRoundNumber,
    tiebreakerRound: state.tiebreakerActive ? state.tiebreakerRound + 1 : 0,
  };
  return newState;
}

/**
 * Reset match-level state (scores, bags, round history, tiebreaker) while
 * keeping the same players in the same room. Used by the "New Match" button.
 */
export function resetMatch(state: GameState): GameState {
  return {
    ...state,
    phase: "waiting",
    hands: [[], []],
    bids: [null, null],
    currentBidder: null,
    tricks: [0, 0],
    currentTrick: [],
    currentTurnIndex: null,
    spadesBroken: false,
    scores: [0, 0],
    bags: [0, 0],
    roundHistory: [],
    roundNumber: 0,
    trickLeader: 0,
    tiebreakerActive: false,
    tiebreakerRound: 0,
    lastCardPlayed: null,
    // New match → re-toss the coin
    coinFlipWinner: null,
    firstBidderRound1: null,
  };
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

  // When both bids are locked, the FIRST BIDDER of this round also leads
  // the first trick — house rule. trickLeader/leadPlayerIndex/currentTurnIndex
  // all align to that seat. Subsequent tricks are led by their winner
  // (handled at the end of playCard) — unchanged.
  const firstBidder = getFirstBidderForRound(state, state.roundNumber);

  const newState: GameState = {
    ...state,
    bids: newBids,
    currentBidder: bothBid ? null : (otherIndex as 0 | 1),
    phase: bothBid ? "playing" : "bidding",
    currentTurnIndex: bothBid ? firstBidder : null,
    leadPlayerIndex: bothBid ? firstBidder : state.leadPlayerIndex,
    trickLeader: bothBid ? firstBidder : state.trickLeader,
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
    lastCardPlayed: { card, playerIndex },
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

    const target = state.matchTarget;
    const bothAtTarget    = finalScores[0] >= target && finalScores[1] >= target;
    const someoneAtTarget = finalScores[0] >= target || finalScores[1] >= target;
    const isTied          = finalScores[0] === finalScores[1];

    // Determine next tiebreaker state and phase
    let nextTiebreakerActive = state.tiebreakerActive;
    let nextTiebreakerRound  = state.tiebreakerRound;
    let isGameOver = false;

    if (state.tiebreakerActive) {
      // Currently inside a 3-round tiebreaker block. tiebreakerRound was
      // incremented in startRound() at the start of this round, so
      // tiebreakerRound === 3 means the block just finished.
      if (state.tiebreakerRound >= 3) {
        if (isTied) {
          // Still tied — start another 3-round block on the next call to startRound
          nextTiebreakerActive = true;
          nextTiebreakerRound  = 0;
        } else {
          isGameOver = true;
        }
      }
      // else: mid-block, just continue to round_over
    } else if (someoneAtTarget) {
      if (bothAtTarget && isTied) {
        // Trigger first tiebreaker block
        nextTiebreakerActive = true;
        nextTiebreakerRound  = 0;
      } else {
        // Someone reached target and is ahead → game over
        isGameOver = true;
      }
    }

    const finalState: GameState = {
      ...intermediateState,
      currentTrick: [],
      scores: finalScores,
      bags: newBags,
      phase: isGameOver ? "game_over" : "round_over",
      currentTurnIndex: null,
      roundHistory: [...state.roundHistory, roundHistory],
      tiebreakerActive: nextTiebreakerActive,
      tiebreakerRound:  nextTiebreakerRound,
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
      // Nil bid — 1v1 Competitive Spades house rule: ±125
      if (tricksTaken === 0) {
        scoreDeltas[i] = 125;
      } else {
        scoreDeltas[i] = -125;
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

export function createRoom(
  hostPlayerName: string,
  hostSocketId: string,
  matchTarget = 250,
  matchLabel?: string
): GameState {
  let code: string;
  do {
    code = makeRoomCode();
  } while (rooms.has(code));

  const state = createGame(code, matchTarget, matchLabel);
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
    // Also check spectators — silently remove them (no notification needed)
    const specIdx = state.spectators.findIndex((s) => s.socketId === socketId);
    if (specIdx >= 0) {
      state.spectators.splice(specIdx, 1);
      return state;
    }
  }
  return null;
}

export function addSpectator(
  roomCode: string,
  name: string,
  socketId: string
): GameState {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  // Prevent the same socket joining twice
  const existing = state.spectators.findIndex((s) => s.socketId === socketId);
  if (existing >= 0) {
    state.spectators[existing] = { id: socketId, name, socketId };
  } else {
    state.spectators.push({ id: socketId, name, socketId });
  }
  rooms.set(roomCode, state);
  return state;
}

export function reconnectSpectator(
  roomCode: string,
  name: string,
  newSocketId: string
): GameState {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  // Just (re)add — same as a fresh spectator join
  state.spectators.push({ id: newSocketId, name, socketId: newSocketId });
  rooms.set(roomCode, state);
  return state;
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
