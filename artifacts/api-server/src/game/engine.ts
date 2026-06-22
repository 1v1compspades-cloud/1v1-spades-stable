import {
  randomInt,
} from "node:crypto";
import {
  Card,
  Suit,
  createDeck,
  shuffleDeck,
  dealHands,
  determineTrickWinner,
  sortHand,
  cardValue,
} from "./deck.js";

export type GamePhase =
  | "waiting"
  | "coin_toss"
  | "shuffling"
  | "bidding"
  | "playing"
  | "round_over"
  | "game_over";

export interface Player {
  id: string;
  name: string;
  profileUsername?: string | null;
  accountId?: string | null;
  accountUsername?: string | null;
  rankedIdentityValidated?: boolean;
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
  /**
   * The two cards from the most recently *completed* trick.
   * Empty array until the first trick fully resolves.
   * Persists through the next trick and only updates when the next trick completes.
   * Cleared on resetMatch.
   */
  lastCompletedTrick: TrickCard[];
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
  /**
   * Per-seat timestamp (epoch ms) of the last meaningful activity from that
   * player: join, reconnect, bid, or card played. Used by the client to
   * surface a soft AFK indicator. Never used to auto-forfeit.
   */
  lastActiveAt: [number, number];
  /**
   * Per-seat disconnect timestamp. A recent disconnected/tokenized waiting
   * seat is briefly reserved for reconnect; after the grace window a fresh
   * player can safely reclaim it.
   */
  disconnectedAt?: [number | null, number | null];
  /** Last disconnected player snapshot, kept only long enough to restore metadata on reconnect. */
  disconnectedPlayers?: [Player | null, Player | null];
  /**
   * Per-seat ready flag for the pre-match lobby. Both must be true before
   * the host can press "Start Match" (server enforces). Reset on
   * resetMatch / disconnect so a fresh opponent has to ready up again.
   */
  ready: [boolean, boolean];
  /**
   * Game mode. "quick" = standard single-match room.
   * "king"  = King of the Table — winner stays, loser is replaced by the
   * next challenger in the queue, and a fresh match auto-starts.
   */
  mode: "quick" | "king";
  /** Challenger queue (KotT). Empty in quick mode. Spectators opt in. */
  challengerQueue: { id: string; name: string; socketId: string }[];
  /** Per-seat consecutive match wins (KotT). Reset on loss / new room. */
  kingStreak: [number, number];
  /**
   * If this room is part of a Custom Tournament bracket match, link back
   * so the socket layer can advance the bracket on game_over.
   */
  tournamentRef?: { code: string; matchId: string };
  /**
   * Host admin pause flag (tournament rooms). When true, place_bid /
   * play_card are rejected and the turn timer is not armed. Cleared by
   * admin_resume_match. Players still see the room state but cannot act.
   */
  isPaused?: boolean;
  /**
   * Per-turn budget in ms. When set (tournament rooms), the socket layer
   * arms a setTimeout for each turn and auto-bids / auto-plays on expiry.
   * Null / undefined → no timer (Quick Match, KotT).
   */
  turnTimeoutMs?: number | null;
  /**
   * Epoch ms by which the current actor (bidder or card-player) must act
   * before being auto-played. Cleared between turns / during animations.
   * Broadcast to clients so they can render a countdown.
   */
  turnDeadline?: number | null;
  /**
   * Per-seat flag: true once a reconnect token has been successfully
   * issued for that seat (DB row written). Reconnect is then gated
   * STRICTLY on a valid token — fallback to engine name-match is only
   * allowed when this flag is false (legacy rooms or rooms where the
   * issue write genuinely failed). Anchoring on this in-memory/persisted
   * flag — and NOT on a runtime DB lookup — prevents a DB outage from
   * silently downgrading a tokenized seat back to the hijack-prone
   * name-match path.
   */
  tokenizedSeats?: [boolean, boolean];
  /** Human-readable game-over reason, including bust-out and auto-victory labels. */
  gameOverReason?: string | null;
  /**
   * Matchmaking classification. Casual/guest matches remain unranked.
   * Ranked is metadata only; it does not alter gameplay, scoring, bidding, or tricks.
   */
  matchKind?: "casual" | "ranked";
  /** True only for ranked account-vs-account quick matches eligible for leaderboards. */
  leaderboardEligible?: boolean;
  /**
   * Explicit winner for non-score-derived endings such as forfeits,
   * disconnect timeouts, or host auto-victory. Natural scoring wins leave this
   * unset and derive the winner from the displayed score.
   */
  winnerSeat?: 0 | 1 | null;
}

/** Max challengers waiting in the KotT queue. */
export const KING_QUEUE_MAX = 20;
export const WAITING_SEAT_RECLAIM_MS = 60_000;

/**
 * House rule: when a player's running total reaches this value or below AFTER
 * a hand has been fully scored (round deltas + bag penalties applied), that
 * player immediately loses the match and the opponent wins. Evaluated only
 * post-scoring in the round-complete path — never mid-hand.
 */
export const LOSS_FLOOR = -250;

function makeRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizePlayerName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createGame(
  roomCode: string,
  matchTarget = 250,
  matchLabel?: string,
  mode: "quick" | "king" = "quick",
): GameState {
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
    lastCompletedTrick: [],
    coinFlipWinner: null,
    firstBidderRound1: null,
    lastActiveAt: [Date.now(), Date.now()],
    disconnectedAt: [null, null],
    disconnectedPlayers: [null, null],
    ready: [false, false],
    mode,
    challengerQueue: [],
    kingStreak: [0, 0],
    turnTimeoutMs: null,
    turnDeadline: null,
    tokenizedSeats: [false, false],
    gameOverReason: null,
    winnerSeat: null,
  };
}

/**
 * Heuristic auto-bid for a timed-out player. Counts likely tricks from the
 * actual hand instead of always bidding 3 (which can ruin a player who
 * really held a strong or a nil-worthy hand).
 *
 * Trick contribution per card:
 *   - Ace of any suit: 1.0
 *   - King of any suit: 0.6 (drops to 0.4 if no queen of that suit in hand,
 *     i.e. K alone is more loseable)
 *   - Queen of spades: 0.3
 *   - Every spade beyond the 4th: +0.5 each (long-suit tricks)
 *
 * Result is rounded and clamped to [1, 6] — never auto-nil (too risky to
 * commit a player to nil without their consent) and never an absurdly
 * high bid.
 */
export function pickAutoBid(state?: GameState, playerIndex?: 0 | 1): number {
  if (!state || playerIndex === undefined) return 3;
  const hand = state.hands[playerIndex];
  if (!hand || hand.length === 0) return 3;
  let score = 0;
  const spadeCount = hand.filter((c) => c.suit === "spades").length;
  for (const c of hand) {
    if (c.rank === "A") score += 1.0;
    else if (c.rank === "K") {
      const hasQ = hand.some((x) => x.suit === c.suit && x.rank === "Q");
      score += hasQ ? 0.6 : 0.4;
    } else if (c.rank === "Q" && c.suit === "spades") score += 0.3;
  }
  if (spadeCount > 4) score += (spadeCount - 4) * 0.5;
  const rounded = Math.round(score);
  return Math.max(1, Math.min(6, rounded));
}

/**
 * Pick the lowest legal card for `playerIndex` to auto-play on a turn
 * timeout. Walks the hand low-to-high, returning the first card
 * `canPlayCard` accepts. Falls back to the hand's lowest card if no legal
 * play is found (shouldn't happen — guaranteed to exist by Spades rules).
 */
export function pickAutoPlayCard(state: GameState, playerIndex: 0 | 1): Card | null {
  const hand = state.hands[playerIndex];
  if (hand.length === 0) return null;
  const sorted = [...hand].sort((a, b) => cardValue(a) - cardValue(b));
  for (const c of sorted) {
    if (canPlayCard(state, playerIndex, c).ok) return c;
  }
  return sorted[0] ?? null;
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
  const winner: 0 | 1 = randomInt(2) as 0 | 1;
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
    gameOverReason: null,
    winnerSeat: null,
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
    lastCompletedTrick: [],
    // New match → re-toss the coin
    coinFlipWinner: null,
    firstBidderRound1: null,
    lastActiveAt: [Date.now(), Date.now()],
    disconnectedAt: [null, null],
    disconnectedPlayers: [null, null],
    ready: [false, false],
    gameOverReason: null,
    winnerSeat: null,
  };
}

/**
 * Toggle/set the ready flag for a seat. Only meaningful in "waiting" phase;
 * silently no-ops otherwise so a late `set_ready` race after Start can't
 * corrupt mid-game state.
 */
export function setPlayerReady(
  roomCode: string,
  socketId: string,
  value: boolean
): GameState {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  const idx = state.players.findIndex((p) => p?.socketId === socketId);
  if (idx < 0) throw new Error("Player not found");
  if (state.phase !== "waiting") {
    // No-op outside the lobby; just return current state so the broadcast
    // reflects truth without throwing.
    return state;
  }
  state.ready[idx as 0 | 1] = !!value;
  rooms.set(roomCode, state);
  return state;
}

/**
 * Host-triggered hard reset: clear all match state but keep both player
 * seats (and the room code) so the same two players can immediately replay
 * without re-sharing the code. Equivalent to `resetMatch` followed by
 * forcing phase back to "waiting" so the host re-clicks "Start".
 */
export function resetRoom(
  roomCode: string,
  requesterSocketId: string,
  opts: { admin?: boolean } = {}
): GameState {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  // Reset Room is an admin/streamer-only destructive tool. The socket layer
  // gates it with requireAdmin and passes { admin: true }; the seat-0 fallback
  // remains only so the engine signature stays usable, but is never reachable
  // from a non-admin caller in production.
  if (!opts.admin && state.players[0]?.socketId !== requesterSocketId) {
    throw new Error("Only the host can reset the room");
  }
  const reset = resetMatch(state);
  rooms.set(roomCode, reset);
  return reset;
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

  const newLastActive: [number, number] = [...state.lastActiveAt] as [number, number];
  newLastActive[playerIndex] = Date.now();

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
    lastActiveAt: newLastActive,
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

  const newLastActive: [number, number] = [...state.lastActiveAt] as [number, number];
  newLastActive[playerIndex] = Date.now();

  let newState: GameState = {
    ...state,
    hands: newHands,
    currentTrick: newTrick,
    spadesBroken: state.spadesBroken || card.suit === "spades",
    lastCardPlayed: { card, playerIndex },
    lastActiveAt: newLastActive,
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
  // Snapshot the completed trick into lastCompletedTrick — this persists into
  // the next trick (and survives the currentTrick: [] clear in finalState below).
  const intermediateState: GameState = {
    ...newState,
    hands: newHands,
    currentTrick: newTrick,   // keep cards on table
    tricks: newTricks,
    trickLeader: winnerIndex,
    currentTurnIndex: null,   // blocks any play_card during the display window
    lastCompletedTrick: newTrick,
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

    // Bag penalties are determined by the SELECTED RACE MODE (match target),
    // NOT the running score:
    //   - Race to 250 → every 5 bags  = -50, then the bag count rolls over (mod 5)
    //   - Race to 500 → every 10 bags = -100, then the bag count rolls over (mod 10)
    // Each completed threshold subtracts the penalty once and the running bag
    // count carried into the next round is the remainder (e.g. 6 bags @250 →
    // -50 and 1 bag left; 11 bags @500 → -100 and 1 bag left). Because the bag
    // count is reset every round, oldBags is always below the threshold.
    const bagThreshold     = state.matchTarget >= 500 ? 10 : 5;
    const bagPenaltyAmount = state.matchTarget >= 500 ? 100 : 50;
    const bagPenalty = (freshBags: number): number =>
      Math.floor(freshBags / bagThreshold) * bagPenaltyAmount;
    const finalScores: [number, number] = [
      newScores[0] - bagPenalty(newBags[0]),
      newScores[1] - bagPenalty(newBags[1]),
    ];

    // Roll the running bag count over by the threshold so it reflects the bags
    // carried INTO the next round (the "bags reset to N" behavior in the rules).
    const carriedBags: [number, number] = [
      newBags[0] % bagThreshold,
      newBags[1] % bagThreshold,
    ];

    const roundHistory: RoundScore = {
      round: state.roundNumber,
      scores: [roundResult.scoreDeltas[0], roundResult.scoreDeltas[1]],
      bags: carriedBags,
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

    // ── House rule: bust-out floor (low-risk, post-scoring only) ──────────
    // Evaluated ONLY here — after the hand is fully scored (round deltas AND
    // bag penalties already folded into finalScores) — never mid-hand. A
    // player whose running total has fallen to LOSS_FLOOR (-250) or below
    // immediately loses; the opponent wins. This overrides any tiebreaker
    // continuation so a bust ends the match outright. The winner is the
    // higher-scoring opponent, which the existing game_over flow (socket
    // advanceTournamentOnGameOver / KotT rotation) already selects. We record a
    // human-readable reason for the game-over UI. The only excluded case is a
    // both-bust EXACT tie (handled below) which must not produce a tied
    // game_over.
    let gameOverReason: string | null = null;
    const seat0Busted = finalScores[0] <= LOSS_FLOOR;
    const seat1Busted = finalScores[1] <= LOSS_FLOOR;
    if (seat0Busted || seat1Busted) {
      if (finalScores[0] !== finalScores[1]) {
        // Normal case: the loser is the LOWER-scoring seat. This is consistent
        // with the downstream higher-score winner selection used by both the
        // tournament advancement (advanceTournamentOnGameOver) and KotT
        // rotation, so the named loser always matches the seat those flows
        // eliminate. In the single-bust case the busted seat necessarily trails
        // (the other seat is > LOSS_FLOOR), so it is also the lower score.
        isGameOver = true;
        nextTiebreakerActive = false;
        nextTiebreakerRound = 0;
        const loserSeat: 0 | 1 = finalScores[0] < finalScores[1] ? 0 : 1;
        const loserName = state.players[loserSeat]?.name ?? `Seat ${loserSeat + 1}`;
        gameOverReason = `${loserName} loses by reaching ${LOSS_FLOOR}.`;
      }
      // else: both seats busted to the EXACT same score — there is no
      // deterministic loser. We deliberately do NOT force game_over here, to
      // preserve the engine invariant that game_over never carries a tied
      // score (the tournament/KotT advancement code relies on this to pick a
      // winner). The hand falls through to normal end-of-round handling and the
      // match continues until a non-tied outcome occurs. This is astronomically
      // rare and never stalls a bracket.
    }

    const finalState: GameState = {
      ...intermediateState,
      currentTrick: [],
      scores: finalScores,
      bags: carriedBags,
      phase: isGameOver ? "game_over" : "round_over",
      currentTurnIndex: null,
      roundHistory: [...state.roundHistory, roundHistory],
      tiebreakerActive: nextTiebreakerActive,
      tiebreakerRound:  nextTiebreakerRound,
      gameOverReason,
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
      // Nil bid — 1v1 Competitive Spades house rule: ±100.
      // A failed nil still accumulates a bag for every trick taken, and each
      // of those bags adds +1 to the round score (e.g. nil + 1 trick = -99,
      // +1 bag). The usual bag-threshold penalties below then apply to the
      // updated bag count just like non-nil overtricks.
      if (tricksTaken === 0) {
        scoreDeltas[i] = 100;
      } else {
        scoreDeltas[i] = -100 + tricksTaken;
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
  matchLabel?: string,
  mode: "quick" | "king" = "quick",
  tournamentRef?: { code: string; matchId: string },
  hostProfileUsername?: string | null,
  hostAccountIdentity?: {
    accountId: string;
    accountUsername: string;
    validatedRanked?: boolean;
  } | null,
  options: { matchKind?: "casual" | "ranked"; leaderboardEligible?: boolean } = {},
): GameState {
  let code: string;
  do {
    code = makeRoomCode();
  } while (rooms.has(code));

  const state = createGame(code, matchTarget, matchLabel, mode);
  state.matchKind = options.matchKind ?? "casual";
  state.leaderboardEligible = options.leaderboardEligible ?? false;
  if (tournamentRef) state.tournamentRef = tournamentRef;
  const host: Player = {
    id: hostSocketId,
    name: hostPlayerName,
    profileUsername: hostProfileUsername ?? null,
    accountId: hostAccountIdentity?.accountId ?? null,
    accountUsername: hostAccountIdentity?.accountUsername ?? null,
    rankedIdentityValidated: hostAccountIdentity?.validatedRanked === true,
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
  socketId: string,
  profileUsername?: string | null,
  accountIdentity?: {
    accountId: string;
    accountUsername: string;
    validatedRanked?: boolean;
  } | null,
): { state: GameState; playerIndex: 0 | 1 } {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  if (state.phase !== "waiting") throw new Error("Game already started");
  const normalizedJoinName = normalizePlayerName(playerName);
  if (state.players.some((p) => p && normalizePlayerName(p.name) === normalizedJoinName)) {
    throw new Error("That player is already seated");
  }

  state.disconnectedAt = state.disconnectedAt ?? [null, null];
  const now = Date.now();
  const seatReservedForReconnect = (seat: 0 | 1): boolean => {
    if (state.players[seat] !== null) return false;
    if (state.tokenizedSeats?.[seat] !== true) return false;
    const disconnectedAt = state.disconnectedAt?.[seat] ?? null;
    if (disconnectedAt === null) return false;
    return now - disconnectedAt < WAITING_SEAT_RECLAIM_MS;
  };
  const preferredSeats: (0 | 1)[] =
    state.players[0] !== null ? [1, 0] : [0, 1];
  const playerIndex = preferredSeats.find(
    (seat) => state.players[seat] === null && !seatReservedForReconnect(seat),
  );
  if (playerIndex === undefined) {
    if ([0, 1].some((seat) => seatReservedForReconnect(seat as 0 | 1))) {
      throw new Error("Seat reserved for reconnect");
    }
    throw new Error("Room is full");
  }

  const joiner: Player = {
    id: socketId,
    name: playerName,
    profileUsername: profileUsername ?? null,
    accountId: accountIdentity?.accountId ?? null,
    accountUsername: accountIdentity?.accountUsername ?? null,
    rankedIdentityValidated: accountIdentity?.validatedRanked === true,
    socketId,
    index: playerIndex,
  };
  state.players[playerIndex] = joiner;
  state.lastActiveAt[playerIndex] = now;
  state.disconnectedAt[playerIndex] = null;
  state.disconnectedPlayers = state.disconnectedPlayers ?? [null, null];
  state.disconnectedPlayers[playerIndex] = null;
  state.ready[playerIndex] = false;
  if (state.tokenizedSeats) state.tokenizedSeats[playerIndex] = false;
  rooms.set(roomCode, state);
  return { state, playerIndex };
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
        state.disconnectedAt = state.disconnectedAt ?? [null, null];
        state.disconnectedPlayers = state.disconnectedPlayers ?? [null, null];
        state.disconnectedAt[i as 0 | 1] = Date.now();
        state.disconnectedPlayers[i as 0 | 1] = {
          ...state.players[i]!,
          socketId: "",
          id: "",
        };
        state.players[i] = null;
        // Clear ready so a fresh opponent (or the same one on reconnect) has
        // to re-ready before the host can start. Only meaningful in waiting phase.
        if (state.phase === "waiting") {
          state.ready[i as 0 | 1] = false;
        }
        return state;
      }
    }
    // Also check spectators — silently remove them (no notification needed)
    const specIdx = state.spectators.findIndex((s) => s.socketId === socketId);
    if (specIdx >= 0) {
      state.spectators.splice(specIdx, 1);
      // A leaving spectator is also dropped from the KotT queue.
      const qIdx = state.challengerQueue.findIndex((c) => c.socketId === socketId);
      if (qIdx >= 0) state.challengerQueue.splice(qIdx, 1);
      return state;
    }
    // Or just a queued-only socket (shouldn't normally happen — queue is a
    // subset of spectators — but defensive).
    const qIdx = state.challengerQueue.findIndex((c) => c.socketId === socketId);
    if (qIdx >= 0) {
      state.challengerQueue.splice(qIdx, 1);
      return state;
    }
  }
  return null;
}

export function leaveWaitingRoom(
  roomCode: string,
  socketId: string,
): { state: GameState | null; removed: boolean; cleanedUp: boolean } {
  const state = rooms.get(roomCode);
  if (!state) return { state: null, removed: false, cleanedUp: false };
  if (state.phase !== "waiting") {
    throw new Error("Cannot leave an active match from the ready screen");
  }

  let removed = false;
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[i]?.socketId === socketId) {
      state.players[i] = null;
      state.ready[i as 0 | 1] = false;
      removed = true;
    }
  }

  const spectatorCountBefore = state.spectators.length;
  state.spectators = state.spectators.filter((s) => s.socketId !== socketId);
  if (state.spectators.length !== spectatorCountBefore) removed = true;

  const queueCountBefore = state.challengerQueue.length;
  state.challengerQueue = state.challengerQueue.filter((c) => c.socketId !== socketId);
  if (state.challengerQueue.length !== queueCountBefore) removed = true;

  if (!removed) return { state, removed: false, cleanedUp: false };

  const hasSeatedPlayers = state.players.some(Boolean);
  const hasObservers = state.spectators.length > 0 || state.challengerQueue.length > 0;
  if (!hasSeatedPlayers && !hasObservers) {
    cleanupRoom(roomCode);
    return { state: null, removed: true, cleanedUp: true };
  }

  rooms.set(roomCode, state);
  return { state, removed: true, cleanedUp: false };
}

// ── King of the Table helpers ────────────────────────────────────────────────

export function addChallenger(
  roomCode: string,
  name: string,
  socketId: string
): GameState {
  const state = rooms.get(roomCode);
  if (!state) throw new Error("Room not found");
  if (state.mode !== "king") throw new Error("Queue only available in King of the Table mode");
  if (state.players.some((p) => p?.socketId === socketId)) {
    throw new Error("You're already at the table");
  }
  const trimmed = (name || "Challenger").slice(0, 24);
  const existing = state.challengerQueue.findIndex((c) => c.socketId === socketId);
  if (existing >= 0) {
    state.challengerQueue[existing] = { id: socketId, name: trimmed, socketId };
  } else {
    if (state.challengerQueue.length >= KING_QUEUE_MAX) {
      throw new Error("Challenger queue is full");
    }
    state.challengerQueue.push({ id: socketId, name: trimmed, socketId });
  }
  rooms.set(roomCode, state);
  return state;
}

export function removeChallenger(
  roomCode: string,
  socketId: string
): GameState | null {
  const state = rooms.get(roomCode);
  if (!state) return null;
  const idx = state.challengerQueue.findIndex((c) => c.socketId === socketId);
  if (idx < 0) return state;
  state.challengerQueue.splice(idx, 1);
  rooms.set(roomCode, state);
  return state;
}

/**
 * KotT host control: move the challenger identified by socketId to the head
 * of the queue so they are seated in the next rotation. No-op (returns the
 * unchanged state) if the socketId isn't queued or it's already at the head.
 */
export function setNextChallenger(
  roomCode: string,
  socketId: string
): GameState | null {
  const state = rooms.get(roomCode);
  if (!state) return null;
  const idx = state.challengerQueue.findIndex((c) => c.socketId === socketId);
  if (idx <= 0) return state;
  const [entry] = state.challengerQueue.splice(idx, 1);
  state.challengerQueue.unshift(entry);
  rooms.set(roomCode, state);
  return state;
}

export interface KingPromotion {
  state: GameState;
  promoted: { socketId: string; playerIndex: 0 | 1; name: string };
  /** Null when the loser already disconnected before promotion ran. */
  demoted: { socketId: string; name: string; previousIndex: 0 | 1 } | null;
}

/**
 * KotT: at game_over, identify the winning seat, bump their streak, demote
 * the loser to a spectator, and promote the head of the queue into the
 * loser's seat. Returns null if the mode isn't king, the queue is empty,
 * or the scores are tied (rare). The returned state is fully reset for a
 * fresh match (call performCoinToss + startRound next).
 */
export function promoteNextChallenger(
  roomCode: string
): KingPromotion | null {
  const state = rooms.get(roomCode);
  if (!state) return null;
  if (state.mode !== "king") return null;
  if (state.phase !== "game_over") return null;
  if (state.challengerQueue.length === 0) return null;

  const [s0, s1] = state.scores;

  // Identify winner/loser. Normal path: higher score wins.
  // Edge: the loser may have disconnected between game_over and rotation —
  // their seat is null. In that case treat the surviving seat as the
  // winner and fill the null seat with the challenger.
  let winnerIdx: 0 | 1;
  let loserIdx: 0 | 1;
  const p0 = state.players[0];
  const p1 = state.players[1];
  if (state.winnerSeat === 0 || state.winnerSeat === 1) {
    winnerIdx = state.winnerSeat;
    loserIdx = winnerIdx === 0 ? 1 : 0;
  }
  else if (p0 && !p1)      { winnerIdx = 0; loserIdx = 1; }
  else if (!p0 && p1) { winnerIdx = 1; loserIdx = 0; }
  else if (!p0 && !p1) {
    // Both seats empty — KotT can't auto-resolve, abandon.
    return null;
  } else {
    if (s0 === s1) return null;
    winnerIdx = s0 > s1 ? 0 : 1;
    loserIdx = winnerIdx === 0 ? 1 : 0;
  }

  const winner = state.players[winnerIdx];
  const loser = state.players[loserIdx]; // may be null if they disconnected
  if (!winner) return null;

  // Bump streaks (winner +1, loser resets).
  const newStreak: [number, number] = [state.kingStreak[0], state.kingStreak[1]];
  newStreak[winnerIdx] = newStreak[winnerIdx] + 1;
  newStreak[loserIdx] = 0;

  // Move the loser to spectators (so they can re-queue if they want).
  // Skip if loser already disconnected — there's no one to demote.
  if (loser && !state.spectators.some((s) => s.socketId === loser.socketId)) {
    state.spectators.push({
      id: loser.socketId,
      name: loser.name,
      socketId: loser.socketId,
    });
  }

  // Pop the queue head and seat them where the loser was.
  const challenger = state.challengerQueue.shift()!;
  // If the challenger is currently in the spectators list, take them out —
  // they're a player now, not a watcher.
  const sIdx = state.spectators.findIndex((s) => s.socketId === challenger.socketId);
  if (sIdx >= 0) state.spectators.splice(sIdx, 1);

  state.players[loserIdx] = {
    id: challenger.socketId,
    name: challenger.name,
    socketId: challenger.socketId,
    index: loserIdx,
  };
  state.kingStreak = newStreak;

  // Reset all match state for a fresh fight; preserve mode/queue/spectators/
  // kingStreak/players (resetMatch spreads state, so all of these are kept).
  const fresh = resetMatch(state);
  rooms.set(roomCode, fresh);
  return {
    state: fresh,
    promoted: { socketId: challenger.socketId, playerIndex: loserIdx, name: challenger.name },
    demoted: loser
      ? { socketId: loser.socketId, name: loser.name, previousIndex: loserIdx }
      : null,
  };
}

/**
 * KotT: decide whether `socketId` is allowed to "step down" from the table
 * after a match (used by the loser's Rejoin Queue / Back to Lobby actions).
 *
 * ONLY the losing seat may step down. Allowing the winner to step down would
 * let them vacate their seat so `promoteNextChallenger`'s null-seat branch
 * crowns the loser instead — a KotT integrity break. The server is the sole
 * authority here; the client merely hides the button for non-losers.
 */
export function canKottStepDown(
  state: GameState,
  socketId: string
): { ok: true; loserSeat: 0 | 1 } | { ok: false; error: string } {
  if (state.mode !== "king") {
    return { ok: false, error: "Only available in King of the Table mode" };
  }
  if (state.phase !== "game_over") {
    return { ok: false, error: "The match is not over yet" };
  }
  const seat = state.players.findIndex((p) => p?.socketId === socketId);
  if (seat < 0) return { ok: false, error: "You are not seated at this table" };
  const p0 = state.players[0];
  const p1 = state.players[1];
  if (!p0 || !p1) {
    return { ok: false, error: "Both players must be seated to step down" };
  }
  const [s0, s1] = state.scores;
  if (s0 === s1) return { ok: false, error: "The match was a draw" };
  const loserSeat: 0 | 1 = s0 < s1 ? 0 : 1;
  if (seat !== loserSeat) {
    return { ok: false, error: "Only the losing player can step down" };
  }
  return { ok: true, loserSeat };
}

/** Hard cap on watchers per room — prevents broadcast fan-out amplification. */
export const MAX_SPECTATORS_PER_ROOM = 50;

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
    if (state.spectators.length >= MAX_SPECTATORS_PER_ROOM) {
      throw new Error("Room is full — spectator limit reached");
    }
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
  // Deduplicate: if this socket is already registered as a spectator, update
  // in place (same path as addSpectator). If not found by socketId, remove any
  // stale entry with the same name (the previous connection's record) and then
  // add the new one — but never create duplicates or grow unboundedly.
  const bySocket = state.spectators.findIndex((s) => s.socketId === newSocketId);
  if (bySocket >= 0) {
    state.spectators[bySocket] = { id: newSocketId, name, socketId: newSocketId };
  } else {
    // Remove the old-socketId entry for this name, if present
    const byName = state.spectators.findIndex((s) => s.name === name);
    if (byName >= 0) {
      state.spectators[byName] = { id: newSocketId, name, socketId: newSocketId };
    } else {
      if (state.spectators.length >= MAX_SPECTATORS_PER_ROOM) {
        throw new Error("Room is full — spectator limit reached");
      }
      state.spectators.push({ id: newSocketId, name, socketId: newSocketId });
    }
  }
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

/**
 * Read-only scan: find the room that contains this socket in ANY role
 * (seated player, spectator, or queued challenger). Used by the disconnect
 * handler to pick the per-room lock BEFORE mutating, so the actual
 * remove happens inside `withRoomLock`.
 */
export function findRoomBySocketAny(socketId: string): GameState | null {
  for (const [, state] of rooms) {
    if (state.players.some((p) => p?.socketId === socketId)) return state;
    if (state.spectators.some((s) => s.socketId === socketId)) return state;
    if (state.challengerQueue.some((c) => c.socketId === socketId)) return state;
  }
  return null;
}

export function cleanupRoom(roomCode: string): void {
  rooms.delete(roomCode);
}

/** Iterate all live rooms (used by the stale-room sweeper). */
export function getAllRooms(): GameState[] {
  return Array.from(rooms.values());
}

/**
 * Boot-time rehydration: put a previously-persisted room back into the
 * in-memory Map. Caller is responsible for sanitization concerns (the
 * stored state has socketId="" stripped, which reconnectPlayer naturally
 * handles by updating the slot's socketId on the next reconnect_player).
 */
export function restoreRoom(state: GameState): void {
  // Defensive: spectators/queue carry stale socketIds from before the
  // restart, so clear them — those clients will rejoin via reconnect_spectator
  // / join_queue and re-register fresh socket ids.
  state.spectators = [];
  state.challengerQueue = [];
  rooms.set(state.roomCode, state);
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
  state.disconnectedAt = state.disconnectedAt ?? [null, null];
  state.disconnectedPlayers = state.disconnectedPlayers ?? [null, null];
  if (!player) {
    // Slot was cleared (e.g. opponent disconnected us) — restore it
    const previous = state.disconnectedPlayers[playerIndex];
    const norm = (s: string) => s.trim().toLowerCase();
    const restoredMetadata =
      previous && norm(previous.name) === norm(playerName)
        ? previous
        : null;
    state.players[playerIndex] = {
      ...(restoredMetadata ?? {}),
      id: newSocketId,
      name: restoredMetadata?.name ?? playerName,
      socketId: newSocketId,
      index: playerIndex,
    };
  } else {
    // Name must match the seat — protects against a stranger with the room
    // code claiming someone else's seat. Case-insensitive, trim-tolerant.
    const norm = (s: string) => s.trim().toLowerCase();
    if (norm(player.name) !== norm(playerName)) {
      throw new Error("That seat is held by another player");
    }
    // Update socketId to the new connection
    player.socketId = newSocketId;
    player.id = newSocketId;
  }

  state.lastActiveAt[playerIndex] = Date.now();
  state.disconnectedAt[playerIndex] = null;
  state.disconnectedPlayers[playerIndex] = null;
  rooms.set(roomCode, state);
  return state;
}
