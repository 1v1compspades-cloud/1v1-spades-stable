/**
 * Phase 2 reconnect correctness tests.
 *
 * These tests prove that a browser refresh / socket replacement restores the
 * same seat without resetting match state across the phases players hit most:
 * coin toss, bidding, playing, and round over.
 *
 * Run with:
 *   node node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs artifacts/api-server/src/game/__tests__/reconnect-phase-state.test.mts
 */
import {
  createRoom,
  joinRoom,
  performCoinToss,
  startRound,
  placeBid,
  playCard,
  pickAutoPlayCard,
  updateRoom,
  removePlayerFromRoom,
  reconnectPlayer,
  type GameState,
} from "../engine.js";
import type { Card } from "../deck.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];
let serial = 0;

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  PASS ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL ${label}`, detail ?? "");
  }
}

function nextSocket(label: string): string {
  serial++;
  return `sock-${label}-${Date.now()}-${serial}`;
}

function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function handKeys(cards: Card[]): string[] {
  return cards.map(cardKey);
}

function createCasualRoom(label: string, matchTarget = 500): GameState {
  const room = createRoom(`Host ${label}`, nextSocket(`${label}-host`), matchTarget);
  joinRoom(room.roomCode, `Guest ${label}`, nextSocket(`${label}-guest`));
  return room;
}

function createRankedRoom(label: string): GameState {
  const room = createRoom(
    `Ranked Host ${label}`,
    nextSocket(`${label}-ranked-host`),
    500,
    "Find Match",
    "quick",
    undefined,
    `RankedHost${label}`,
    {
      accountId: `acct-ranked-host-${label}`,
      accountUsername: `RankedHost${label}`,
      validatedRanked: true,
    },
    { matchKind: "ranked", leaderboardEligible: true },
  );
  joinRoom(
    room.roomCode,
    `Ranked Guest ${label}`,
    nextSocket(`${label}-ranked-guest`),
    `RankedGuest${label}`,
    {
      accountId: `acct-ranked-guest-${label}`,
      accountUsername: `RankedGuest${label}`,
      validatedRanked: true,
    },
  );
  return room;
}

function createTournamentRoom(label: string): GameState {
  const room = createRoom(
    `Tournament Host ${label}`,
    nextSocket(`${label}-tournament-host`),
    500,
    "Semifinal 1",
    "quick",
    { code: `T${label}`, matchId: `match-${label}` },
  );
  joinRoom(room.roomCode, `Tournament Guest ${label}`, nextSocket(`${label}-tournament-guest`));
  return room;
}

function deal(state: GameState): GameState {
  const dealt = startRound(state);
  updateRoom(dealt);
  return dealt;
}

function placeOneBid(state: GameState, bid = 4): GameState {
  const bidder = state.currentBidder;
  if (bidder !== 0 && bidder !== 1) throw new Error("No current bidder");
  const result = placeBid(state, bidder, bid);
  updateRoom(result.state);
  return result.state;
}

function placeBothBids(state: GameState, firstBid = 4, secondBid = 4): GameState {
  const firstBidder = state.currentBidder;
  if (firstBidder !== 0 && firstBidder !== 1) throw new Error("No current bidder");
  const other = firstBidder === 0 ? 1 : 0;
  const first = placeBid(state, firstBidder, firstBid);
  const second = placeBid(first.state, other, secondBid);
  updateRoom(second.state);
  return second.state;
}

function reconnectSeat(state: GameState, seat: 0 | 1, newSocketId: string): GameState {
  const player = state.players[seat];
  if (!player) throw new Error(`Seat ${seat} is empty before reconnect`);
  const name = player.name;
  const oldSocketId = player.socketId;
  removePlayerFromRoom(oldSocketId);
  return reconnectPlayer(state.roomCode, seat, newSocketId, name);
}

function playOneLegalCard(state: GameState): GameState {
  const actor = state.currentTurnIndex;
  if (actor !== 0 && actor !== 1) throw new Error("No current turn");
  const card = pickAutoPlayCard(state, actor);
  if (!card) throw new Error("No legal card available");
  const result = playCard(state, actor, card);
  updateRoom(result.state);
  return result.state;
}

function playToRoundOver(state: GameState): GameState {
  let current = state;
  let guard = 0;
  while (current.phase === "playing") {
    current = playOneLegalCard(current);
    guard++;
    if (guard > 26) throw new Error("Round did not complete within 26 card plays");
  }
  return current;
}

console.log("\n- Reconnect phase/state correctness -");

// Coin toss refresh: reconnect must keep the toss result and not deal/reset.
{
  const room = createCasualRoom("coin");
  const tossed = performCoinToss(room);
  updateRoom(tossed);
  const before = {
    phase: tossed.phase,
    coinFlipWinner: tossed.coinFlipWinner,
    firstBidderRound1: tossed.firstBidderRound1,
    handSizes: [tossed.hands[0].length, tossed.hands[1].length],
  };

  const restored = reconnectSeat(tossed, 1, nextSocket("coin-restored"));

  ok("coin toss reconnect keeps phase", restored.phase === before.phase, restored.phase);
  ok("coin toss reconnect keeps winner", restored.coinFlipWinner === before.coinFlipWinner, restored.coinFlipWinner);
  ok("coin toss reconnect keeps first bidder", restored.firstBidderRound1 === before.firstBidderRound1, restored.firstBidderRound1);
  ok(
    "coin toss reconnect does not deal cards early",
    JSON.stringify([restored.hands[0].length, restored.hands[1].length]) === JSON.stringify(before.handSizes),
    [restored.hands[0].length, restored.hands[1].length],
  );
}

// Bidding refresh: reconnect must keep the locked bid, current bidder, and
// ranked/account metadata used by ranked public matches.
{
  let state = createRankedRoom("bidding");
  state = deal(state);
  state = placeOneBid(state, 5);
  const seatToReconnect = state.currentBidder as 0 | 1;
  const ownHand = handKeys(state.hands[seatToReconnect]);
  const expected = {
    bids: JSON.stringify(state.bids),
    currentBidder: state.currentBidder,
    roundNumber: state.roundNumber,
    matchKind: state.matchKind,
    leaderboardEligible: state.leaderboardEligible,
    accountId: state.players[seatToReconnect]?.accountId,
    accountUsername: state.players[seatToReconnect]?.accountUsername,
  };

  const restored = reconnectSeat(state, seatToReconnect, nextSocket("bidding-restored"));

  ok("bidding reconnect keeps phase", restored.phase === "bidding", restored.phase);
  ok("bidding reconnect keeps locked bids", JSON.stringify(restored.bids) === expected.bids, restored.bids);
  ok("bidding reconnect keeps current bidder", restored.currentBidder === expected.currentBidder, restored.currentBidder);
  ok("bidding reconnect keeps round number", restored.roundNumber === expected.roundNumber, restored.roundNumber);
  ok("bidding reconnect keeps ranked match kind", restored.matchKind === expected.matchKind, restored.matchKind);
  ok("bidding reconnect keeps leaderboard eligibility", restored.leaderboardEligible === expected.leaderboardEligible, restored.leaderboardEligible);
  ok("bidding reconnect keeps account id", restored.players[seatToReconnect]?.accountId === expected.accountId, restored.players[seatToReconnect]);
  ok("bidding reconnect keeps account username", restored.players[seatToReconnect]?.accountUsername === expected.accountUsername, restored.players[seatToReconnect]);
  ok("bidding reconnect keeps own current hand", handKeys(restored.hands[seatToReconnect]).join("|") === ownHand.join("|"), restored.hands[seatToReconnect]);
}

// Playing refresh: reconnect must keep the active trick and whose turn it is.
{
  let state = createCasualRoom("playing");
  state = deal(state);
  state = placeBothBids(state, 4, 4);
  state = playOneLegalCard(state);
  const seatToReconnect = state.currentTurnIndex as 0 | 1;
  const ownHand = handKeys(state.hands[seatToReconnect]);
  const expected = {
    phase: state.phase,
    currentTurnIndex: state.currentTurnIndex,
    currentTrick: state.currentTrick.map((tc) => `${tc.playerIndex}:${cardKey(tc.card)}`).join("|"),
    tricks: JSON.stringify(state.tricks),
    lastCardPlayed: state.lastCardPlayed ? `${state.lastCardPlayed.playerIndex}:${cardKey(state.lastCardPlayed.card)}` : null,
  };

  const restored = reconnectSeat(state, seatToReconnect, nextSocket("playing-restored"));

  ok("playing reconnect keeps phase", restored.phase === expected.phase, restored.phase);
  ok("playing reconnect keeps current turn", restored.currentTurnIndex === expected.currentTurnIndex, restored.currentTurnIndex);
  ok(
    "playing reconnect keeps active trick",
    restored.currentTrick.map((tc) => `${tc.playerIndex}:${cardKey(tc.card)}`).join("|") === expected.currentTrick,
    restored.currentTrick,
  );
  ok("playing reconnect keeps trick counters", JSON.stringify(restored.tricks) === expected.tricks, restored.tricks);
  ok(
    "playing reconnect keeps last card",
    (restored.lastCardPlayed ? `${restored.lastCardPlayed.playerIndex}:${cardKey(restored.lastCardPlayed.card)}` : null) === expected.lastCardPlayed,
    restored.lastCardPlayed,
  );
  ok("playing reconnect keeps current own hand", handKeys(restored.hands[seatToReconnect]).join("|") === ownHand.join("|"), restored.hands[seatToReconnect]);
}

// Round-over refresh: reconnect must keep settled scores/bags/history and zero
// hand sizes while the next-round countdown is showing.
{
  let state = createCasualRoom("roundover");
  state = deal(state);
  state = placeBothBids(state, 4, 4);
  state = playToRoundOver(state);
  const expected = {
    phase: state.phase,
    scores: JSON.stringify(state.scores),
    bags: JSON.stringify(state.bags),
    roundHistoryLength: state.roundHistory.length,
    handSizes: JSON.stringify([state.hands[0].length, state.hands[1].length]),
  };

  const restored = reconnectSeat(state, 0, nextSocket("roundover-restored"));

  ok("round-over reconnect reaches round_over", expected.phase === "round_over", expected.phase);
  ok("round-over reconnect keeps phase", restored.phase === expected.phase, restored.phase);
  ok("round-over reconnect keeps scores", JSON.stringify(restored.scores) === expected.scores, restored.scores);
  ok("round-over reconnect keeps bags", JSON.stringify(restored.bags) === expected.bags, restored.bags);
  ok("round-over reconnect keeps history", restored.roundHistory.length === expected.roundHistoryLength, restored.roundHistory);
  ok("round-over reconnect keeps empty hands", JSON.stringify([restored.hands[0].length, restored.hands[1].length]) === expected.handSizes, restored.hands);
  ok("round-over reconnect leaves own hand empty", restored.hands[0].length === 0, restored.hands[0]);
}

// Tournament-tagged room refresh: reconnect must not drop tournament linkage,
// match label, or the active playing phase.
{
  let state = createTournamentRoom("phase2");
  state = deal(state);
  state = placeBothBids(state, 4, 4);
  const expected = {
    phase: state.phase,
    label: state.matchLabel,
    tournamentCode: state.tournamentRef?.code,
    matchId: state.tournamentRef?.matchId,
  };

  const restored = reconnectSeat(state, 0, nextSocket("tournament-restored"));

  ok("tournament reconnect keeps playing phase", restored.phase === expected.phase, restored.phase);
  ok("tournament reconnect keeps match label", restored.matchLabel === expected.label, restored.matchLabel);
  ok("tournament reconnect keeps tournament code", restored.tournamentRef?.code === expected.tournamentCode, restored.tournamentRef);
  ok("tournament reconnect keeps match id", restored.tournamentRef?.matchId === expected.matchId, restored.tournamentRef);
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("Failures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
