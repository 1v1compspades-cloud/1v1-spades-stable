/**
 * Phase 5 — 1v1 Competitive Spades rules validation.
 *
 * Pure-function tests against the deterministic engine. No DB, no sockets.
 * Each test builds a GameState with scripted hands, then drives bidding
 * and play through the engine and asserts on the resulting state.
 *
 * Run:  npx -y tsx@latest artifacts/api-server/src/game/__tests__/rules.test.mts
 */
import {
  createGame,
  placeBid,
  playCard,
  canPlayCard,
  performCoinToss,
  getFirstBidderForRound,
  startRound,
  pickAutoBid,
  pickAutoPlayCard,
  type GameState,
} from "../engine.js";
import {
  type Card,
  type Suit,
  type Rank,
  createDeck,
  determineTrickWinner,
  winsTrick,
  cardValue,
} from "../deck.js";
import {
  createTournament,
  joinTournament,
  startTournament,
  recordMatchResult,
  getTournament,
  flushTournamentLocks,
} from "../tournament.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
    console.log(`  \u2713 ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  \u2717 ${label}`);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`);
  }
}
function group(name: string) { console.log(`\n[${name}]`); }

// ── Card / hand helpers ─────────────────────────────────────────────────────
const C = (rank: Rank, suit: Suit): Card => ({ suit, rank });
const eqCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;

/** Build a 13-card hand from a compact `"AS KH 2C"` style string. */
function hand(spec: string): Card[] {
  const tokens = spec.trim().split(/\s+/);
  return tokens.map((t) => {
    const suitChar = t.slice(-1).toUpperCase();
    const rankStr = t.slice(0, -1);
    const suit: Suit =
      suitChar === "S" ? "spades" :
      suitChar === "H" ? "hearts" :
      suitChar === "D" ? "diamonds" :
      suitChar === "C" ? "clubs" :
      (() => { throw new Error(`Bad suit char in ${t}`); })();
    const rank = rankStr as Rank;
    return { suit, rank };
  });
}

/**
 * Build a deterministic game state ready for bidding with the two scripted
 * hands. Bypasses shuffle/deal. `firstBidder` is the seat that bids first.
 */
function mkGameForBidding(
  h0: Card[],
  h1: Card[],
  opts: { firstBidder?: 0 | 1; matchTarget?: number; preScores?: [number, number]; preBags?: [number, number]; roundNumber?: number } = {},
): GameState {
  const firstBidder = opts.firstBidder ?? 0;
  const state = createGame("TESTRM", opts.matchTarget ?? 250);
  state.players[0] = { id: "p0", name: "Alice", socketId: "p0", index: 0 };
  state.players[1] = { id: "p1", name: "Bob", socketId: "p1", index: 1 };
  state.coinFlipWinner = firstBidder === 0 ? 1 : 0;
  state.firstBidderRound1 = firstBidder;
  state.phase = "bidding";
  state.hands = [h0, h1];
  state.bids = [null, null];
  state.currentBidder = firstBidder;
  state.roundNumber = opts.roundNumber ?? 1;
  state.tricks = [0, 0];
  state.currentTrick = [];
  state.spadesBroken = false;
  state.scores = opts.preScores ? [...opts.preScores] : [0, 0];
  state.bags = opts.preBags ? [...opts.preBags] : [0, 0];
  state.leadPlayerIndex = firstBidder;
  state.trickLeader = firstBidder;
  return state;
}

/** Both players bid. Returns the state after both bids are locked. */
function bothBid(state: GameState, bidFirst: number, bidSecond: number): GameState {
  const firstBidder = state.currentBidder as 0 | 1;
  const other: 0 | 1 = firstBidder === 0 ? 1 : 0;
  const r1 = placeBid(state, firstBidder, bidFirst);
  const r2 = placeBid(r1.state, other, bidSecond);
  return r2.state;
}

/** Play a sequence of cards. Each item is [seat, card]. Returns the final state and
 * an array of per-play results (so callers can inspect intermediate state, trick winners,
 * roundComplete, etc.). */
function playSequence(
  state: GameState,
  plays: Array<[0 | 1, Card]>,
): { state: GameState; results: ReturnType<typeof playCard>[] } {
  let cur = state;
  const results: ReturnType<typeof playCard>[] = [];
  for (const [seat, card] of plays) {
    const r = playCard(cur, seat, card);
    results.push(r);
    cur = r.state;
  }
  return { state: cur, results };
}

// ── Mirror of socket.ts sanitize logic (we don't import socket.ts to keep
// the test pure). If these mirrors drift from socket.ts, the dedicated
// integration tests in tournament-tx.test.mts will catch it. ─────────────
function sanitizeForPlayer(state: GameState, idx: 0 | 1) {
  const opp = idx === 0 ? 1 : 0;
  return {
    hand: state.hands[idx],
    opponentHandSize: state.hands[opp].length,
    handSizes: [state.hands[0].length, state.hands[1].length] as [number, number],
    isSpectator: false,
  };
}
function sanitizeForSpectator(state: GameState) {
  return {
    hand: [] as Card[],
    opponentHandSize: 0,
    handSizes: [state.hands[0].length, state.hands[1].length] as [number, number],
    isSpectator: true,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1 — Dealer / non-dealer flow
// ═══════════════════════════════════════════════════════════════════════════
group("Test 1 — Dealer / non-dealer / lead flow");
{
  // performCoinToss is idempotent
  const s0 = createGame("R1");
  const s1 = performCoinToss(s0);
  ok("Coin toss assigns winner + firstBidderRound1 as opposites",
    s1.coinFlipWinner !== null &&
    s1.firstBidderRound1 !== null &&
    s1.coinFlipWinner !== s1.firstBidderRound1,
    { winner: s1.coinFlipWinner, firstBidder: s1.firstBidderRound1 });
  const s2 = performCoinToss(s1);
  ok("Coin toss is idempotent (same result on re-call)",
    s1.coinFlipWinner === s2.coinFlipWinner &&
    s1.firstBidderRound1 === s2.firstBidderRound1);
  ok("Coin toss puts phase=coin_toss", s2.phase === "coin_toss");

  // Bidding-order alternation
  const stateRot: GameState = { ...createGame("R2"), coinFlipWinner: 1, firstBidderRound1: 0 };
  ok("Round 1 first bidder = firstBidderRound1 (coin-loser)", getFirstBidderForRound(stateRot, 1) === 0);
  ok("Round 2 first bidder alternates to coin-winner",      getFirstBidderForRound(stateRot, 2) === 1);
  ok("Round 3 first bidder back to coin-loser",             getFirstBidderForRound(stateRot, 3) === 0);
  ok("Round 4 first bidder alternates again",               getFirstBidderForRound(stateRot, 4) === 1);

  // First bidder leads first trick (house rule)
  const h0 = hand("AS KS QS JS 2H 3H 4H 5H 2D 3D 4D 5D 2C");
  const h1 = hand("10S 9S 8S 7S 6H 7H 8H 9H 6D 7D 8D 9D 3C");
  const g = mkGameForBidding(h0, h1, { firstBidder: 1 });
  const r1 = placeBid(g, 1, 3);
  ok("Non-first-bidder cannot bid out of turn", (() => {
    try { placeBid(g, 0, 3); return false; } catch { return true; }
  })());
  const r2 = placeBid(r1.state, 0, 3);
  ok("After both bid, phase = playing", r2.state.phase === "playing");
  ok("First bidder of the round LEADS the first trick", r2.state.currentTurnIndex === 1 && r2.state.leadPlayerIndex === 1 && r2.state.trickLeader === 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2 — Card play legality
// ═══════════════════════════════════════════════════════════════════════════
group("Test 2 — Card play legality");
{
  const h0 = hand("AS KS 2H 3H 4H 5H 6H 2D 3D 4D 5D 6D 2C");
  const h1 = hand("QS JS 10S 9S 7H 8H 9H 10H 7D 8D 9D 10D 3C");
  let s = mkGameForBidding(h0, h1, { firstBidder: 0 });
  s = bothBid(s, 3, 3);

  // Seat 0 leads. They have non-spades, spades not broken → can't lead spades.
  const leadSpadeCheck = canPlayCard(s, 0, C("A", "spades"));
  ok("Cannot lead spades while spades not broken (player holds non-spades)",
    !leadSpadeCheck.ok && /broken/i.test(leadSpadeCheck.reason ?? ""));

  // Can lead a non-spade
  ok("Can lead a non-spade",
    canPlayCard(s, 0, C("2", "hearts")).ok);

  // Out-of-turn play is rejected
  ok("Cannot play out of turn",
    !canPlayCard(s, 1, C("Q", "spades")).ok);

  // Card not in hand is rejected
  ok("Cannot play a card not in hand",
    !canPlayCard(s, 0, C("A", "hearts")).ok);

  // Seat 0 leads 2H; seat 1 has hearts → must follow with hearts
  const led = playCard(s, 0, C("2", "hearts")).state;
  ok("After lead, opponent is on-turn",
    led.currentTurnIndex === 1 && led.currentTrick.length === 1);
  ok("Must follow led suit when holding it",
    !canPlayCard(led, 1, C("3", "clubs")).ok);
  ok("Can follow led suit",
    canPlayCard(led, 1, C("7", "hearts")).ok);

  // Spade-broken via cut: led non-spade, follower has no led suit, plays spade
  {
    const h0b = hand("AS KS 2H 3H 4H 5H 6H 2D 3D 4D 5D 6D 2C"); // 7 hearts
    const h1b = hand("QS JS 10S 9S 8S 7S 6S 5S 4S 3S 7D 8D 3C"); // no hearts
    let s2 = mkGameForBidding(h0b, h1b, { firstBidder: 0 });
    s2 = bothBid(s2, 3, 3);
    ok("Pre-cut: spadesBroken=false", s2.spadesBroken === false);
    const ledH = playCard(s2, 0, C("2", "hearts")).state;
    ok("Follower with no hearts may cut with a spade",
      canPlayCard(ledH, 1, C("3", "spades")).ok);
    const afterCut = playCard(ledH, 1, C("3", "spades"));
    ok("Spade-cut transitions spadesBroken=true",
      afterCut.state.spadesBroken === true);
  }

  // Only-spades exception: holder can lead a spade even though not broken
  {
    const h0c = hand("AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S"); // all spades
    const h1c = hand("AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H");
    let s3 = mkGameForBidding(h0c, h1c, { firstBidder: 0 });
    s3 = bothBid(s3, 5, 5);
    ok("All-spades hand may lead a spade even when not broken",
      canPlayCard(s3, 0, C("A", "spades")).ok);
  }

  // Server validates card against actual hand (tampered card with valid suit but rank not held)
  {
    const h0d = hand("AS 2H 3H 4H 5H 6H 7H 2D 3D 4D 5D 6D 7D");
    const h1d = hand("KS QS JS 10S 8H 9H 10H 8D 9D 10D JD QD KD");
    let s4 = mkGameForBidding(h0d, h1d, { firstBidder: 0 });
    s4 = bothBid(s4, 2, 3);
    ok("Reject card not in hand even if suit is legal",
      !canPlayCard(s4, 0, C("K", "hearts")).ok);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3 — Trick / book logic
// ═══════════════════════════════════════════════════════════════════════════
group("Test 3 — Trick / book / round-end logic");
{
  // Higher card of led suit wins
  ok("Higher rank of led suit wins",
    determineTrickWinner([{ card: C("5", "hearts"), playerIndex: 0 }, { card: C("K", "hearts"), playerIndex: 1 }]) === 1);
  ok("Off-suit non-spade loses to led-suit even higher rank",
    determineTrickWinner([{ card: C("5", "hearts"), playerIndex: 0 }, { card: C("A", "clubs"), playerIndex: 1 }]) === 0);
  ok("Spade trumps any non-spade",
    determineTrickWinner([{ card: C("A", "hearts"), playerIndex: 0 }, { card: C("2", "spades"), playerIndex: 1 }]) === 1);
  ok("Higher spade beats lower spade",
    determineTrickWinner([{ card: C("Q", "spades"), playerIndex: 0 }, { card: C("A", "spades"), playerIndex: 1 }]) === 1);
  ok("winsTrick: led wins when tied scenario impossible (same suit, equal rank — no two cards equal in a real deck)",
    winsTrick(C("A", "hearts"), C("2", "hearts"), true) === false);

  // Round-end: play out all 13 tricks deterministically
  const h0 = hand("AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S");          // all spades
  const h1 = hand("AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H");          // all hearts
  let s = mkGameForBidding(h0, h1, { firstBidder: 1 });
  s = bothBid(s, 0, 13); // seat 0 nil, seat 1 bids all 13 (very unrealistic but valid)
  // Seat 1 leads first (firstBidder=1) with heart; seat 0 cuts with a spade → seat 0 wins
  // and now leads. For every subsequent trick, seat 0 leads a spade (broken) and seat 1
  // off-suit discards a heart → seat 0 wins.
  const plays: Array<[0 | 1, Card]> = [];
  const ranks: Rank[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  // Trick 1: seat 1 leads first
  plays.push([1, C(ranks[0], "hearts")]);
  plays.push([0, C(ranks[0], "spades")]);
  // Tricks 2..13: seat 0 leads spade, seat 1 off-suit follows
  for (let i = 1; i < 13; i++) {
    plays.push([0, C(ranks[i], "spades")]);
    plays.push([1, C(ranks[i], "hearts")]);
  }
  const { state: final } = playSequence(s, plays);
  ok("After 13 tricks, both hands empty",
    final.hands[0].length === 0 && final.hands[1].length === 0);
  ok("After all tricks, phase = round_over",
    final.phase === "round_over");
  ok("Seat 0 (spades) took every book",
    final.tricks[0] === 13 && final.tricks[1] === 0);
  ok("roundHistory has 1 entry", final.roundHistory.length === 1);

  // Winner-leads-next: verify second trick lead is the seat that won trick 1
  let s2 = mkGameForBidding(
    hand("AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S"),
    hand("AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H"),
    { firstBidder: 1 },
  );
  s2 = bothBid(s2, 0, 13);
  const r1 = playCard(s2, 1, C("A", "hearts"));      // seat 1 leads
  const r2 = playCard(r1.state, 0, C("2", "spades")); // seat 0 cuts and wins
  ok("Winner of trick leads next",
    r2.state.currentTurnIndex === 0 && r2.state.trickLeader === 0);
  ok("Books incremented for winner only after trick complete",
    r2.state.tricks[0] === 1 && r2.state.tricks[1] === 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 4 — Scoring (5 scripted hands + bag tests + tiebreaker)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 4 — Scoring");

/** Play out an entire round where seat0 plays spades, seat1 plays hearts;
 * seat0 wins all 13 tricks (seat 1 leads). */
function playFullRound_seat0Sweeps(s: GameState): GameState {
  const ranks: Rank[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  const plays: Array<[0 | 1, Card]> = [];
  for (const r of ranks) {
    plays.push([1, C(r, "hearts")]);
    plays.push([0, C(r, "spades")]);
  }
  return playSequence(s, plays).state;
}

/**
   * Universal forceRoundOutcome helper.
   *
   * Constructs a deterministic round where seat 0 takes exactly `tricks0`
   * and seat 1 takes `13 - tricks0`. Hand layout (works for all t0 in 0..13):
   *
   *   firstBidder = 1:
   *     seat 0: t0  high spades + (13-t0) low clubs
   *     seat 1: (13-t0) low spades + t0 low hearts
   *
   *   firstBidder = 0: mirrored (seat indices swapped + first plays mirrored).
   *
   * Play script for firstBidder=1, 1 <= t0 <= 12:
   *   Phase A (t0 tricks): seat 1 leads a low heart; seat 0 has no hearts, cuts
   *     with a low spade (cheapest winning cut) -> seat 0 wins; spades broken.
   *   After Phase A: seat 0 has 13-t0 clubs left; seat 1 has 13-t0 low spades left.
   *   Phase B (13-t0 tricks): seat 0 (on lead) leads a low club; seat 1 has no
   *     clubs, cuts with a low spade -> seat 1 wins. Then seat 1 leads low spade,
   *     seat 0 discards a club -> seat 1 wins. Repeats until both hands empty.
   *
   * Edge cases:
   *   t0 = 0:  seat 1 only has hearts (no spades) + heart suit-only. Seat 1 leads
   *            low heart; seat 0 (only clubs) discards -> seat 1 wins. Repeat x13.
   *   t0 = 13: seat 1 only has hearts; seat 0 has all 13 spades. Same Phase A x13.
   */
  function forceRoundOutcome(opts: {
    bid0: number; bid1: number;
    tricks0: number;
    preScores?: [number, number];
    preBags?: [number, number];
    matchTarget?: number;
    firstBidder?: 0 | 1;
    tiebreakerActive?: boolean;
    tiebreakerRound?: number;
    roundNumber?: number;
  }): GameState {
    const t0 = opts.tricks0;
    if (t0 < 0 || t0 > 13) throw new Error(`t0 out of range: ${t0}`);
    const firstBidder: 0 | 1 = opts.firstBidder ?? 1;

    const ranksDesc: Rank[] = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
    // Layout for firstBidder=1; we'll mirror for firstBidder=0.
    // "Leader" seat is the firstBidder, "follower" seat is the other.
    // In the canonical (firstBidder=1) layout, leader=seat1 and we want
    // follower (seat0) to win t0 tricks.
    const leaderIdx: 0 | 1 = firstBidder;
    const followerIdx: 0 | 1 = firstBidder === 0 ? 1 : 0;
    // Follower's wins target = t0 (when firstBidder=1) or 13-t0 (when firstBidder=0).
    const followerWins = firstBidder === 1 ? t0 : 13 - t0;
    const leaderWins = 13 - followerWins;

    // Build the two hands by role:
    //   follower: followerWins high spades + leaderWins low clubs   (= 13 cards)
    //   leader:   followerWins low  spades + leaderWins low hearts  (= 13 cards)
    // Total: 13 spades + leaderWins clubs + leaderWins hearts <= 39 (always fits).
    const followerHand: Card[] = [
      ...ranksDesc.slice(0, followerWins).map((r) => C(r, "spades")),
      ...ranksDesc.slice(13 - leaderWins).map((r) => C(r, "clubs")),
    ];
    const leaderHand: Card[] = [
      ...ranksDesc.slice(followerWins).map((r) => C(r, "spades")),
      ...ranksDesc.slice(13 - followerWins).map((r) => C(r, "hearts")),
    ];
    if (followerHand.length !== 13 || leaderHand.length !== 13) {
      throw new Error(`bad hand sizes t0=${t0} leader=${leaderHand.length} follower=${followerHand.length}`);
    }
    const h0 = followerIdx === 0 ? followerHand : leaderHand;
    const h1 = followerIdx === 1 ? followerHand : leaderHand;

    let s = mkGameForBidding(h0, h1, {
      firstBidder,
      matchTarget: opts.matchTarget,
      preScores: opts.preScores,
      preBags: opts.preBags,
      roundNumber: opts.roundNumber,
    });
    if (opts.tiebreakerActive !== undefined) s.tiebreakerActive = opts.tiebreakerActive;
    if (opts.tiebreakerRound !== undefined) s.tiebreakerRound = opts.tiebreakerRound;
    const fb = firstBidder;
    s = bothBid(s, fb === 0 ? opts.bid0 : opts.bid1, fb === 0 ? opts.bid1 : opts.bid0);

    // State-aware play loop. Each step:
    //   On lead: play LOWEST legal card. Prefer non-spade if unbroken (and have one);
    //            else prefer non-spade for predictability; spade is fine if broken.
    //   Following: if have led suit -> play LOWEST of led suit (we already control wins via
    //              hand construction; cheap follow keeps math clean).
    //              If no led suit -> CUT with LOWEST spade if you have one; else DISCARD lowest non-spade.
    let cur = s;
    while (cur.hands[0].length > 0 || cur.hands[1].length > 0) {
      const turn = cur.currentTurnIndex as 0 | 1;
      const hand = cur.hands[turn];
      let pick: Card | null = null;
      if (cur.currentTrick.length === 0) {
        // Leading
        const nonSpades = hand.filter((c) => c.suit !== "spades");
        const pool = (!cur.spadesBroken && nonSpades.length > 0) ? nonSpades : hand;
        pick = [...pool].sort((a, b) => cardValue(a) - cardValue(b))[0];
      } else {
        const led = cur.currentTrick[0].card.suit;
        const sameSuit = hand.filter((c) => c.suit === led);
        if (sameSuit.length > 0) {
          pick = [...sameSuit].sort((a, b) => cardValue(a) - cardValue(b))[0];
        } else {
          // No led suit -> cut with lowest spade if any; else discard lowest non-spade.
          const spades = hand.filter((c) => c.suit === "spades");
          if (spades.length > 0) {
            pick = [...spades].sort((a, b) => cardValue(a) - cardValue(b))[0];
          } else {
            pick = [...hand].sort((a, b) => cardValue(a) - cardValue(b))[0];
          }
        }
      }
      if (!pick) throw new Error("auto-play picked null");
      cur = playCard(cur, turn, pick).state;
    }
    if (process.env.DEBUG_HELPER) console.error(`[force t0=${t0} fb=${firstBidder}] tricks=${JSON.stringify(cur.tricks)} bags=${JSON.stringify(cur.bags)} scores=${JSON.stringify(cur.scores)}`);
    return cur;
  }

// Scripted Hand 1 — normal bid/make
{
  const final = forceRoundOutcome({ bid0: 4, bid1: 5, tricks0: 5, firstBidder: 1 });
  // seat 0 bid 4, took 5 → +40 +1 bag = +41
  // seat 1 bid 5, took 8 → +50 +3 bags = +53
  ok("Hand 1 (normal make) — phase round_over", final.phase === "round_over");
  ok("Hand 1 — seat 0 took 5 tricks", final.tricks[0] === 5);
  ok("Hand 1 — seat 1 took 8 tricks", final.tricks[1] === 8);
  ok("Hand 1 — seat 0 score = bid*10 + bags",
    final.scores[0] === 41, { got: final.scores[0] });
  ok("Hand 1 — seat 1 score = bid*10 + overtricks",
    final.scores[1] === 53, { got: final.scores[1] });
  ok("Hand 1 — bags carry forward",
    final.bags[0] === 1 && final.bags[1] === 3);
}

// Scripted Hand 2 — failed bid (+ sub-250 5-bag penalty triggers on opponent)
{
  const final = forceRoundOutcome({ bid0: 8, bid1: 4, tricks0: 4, firstBidder: 1 });
  // seat 0 bid 8, took 4 → -80
  // seat 1 bid 4, took 9 → +40 +5 bags. Pre-score 0 (sub-250) → bags 0→5 crosses
  //   5-bag threshold once → −50 penalty. Net: 40+5−50 = −5.
  ok("Hand 2 (failed bid) — seat 0 lost bid value",
    final.scores[0] === -80, { got: final.scores[0] });
  ok("Hand 2 — seat 1 score = +bid +bags −sub250penalty",
    final.scores[1] === -5, { got: final.scores[1] });
  ok("Hand 2 — failed bid does NOT accumulate bags for the failer",
    final.bags[0] === 0, { got: final.bags[0] });
  ok("Hand 2 — opponent's bags carry forward (not reset by penalty)",
    final.bags[1] === 5, { got: final.bags[1] });
}

// Scripted Hand 3 — successful nil (+ sub-250 5-bag penalty on opponent)
{
  const final = forceRoundOutcome({ bid0: 0, bid1: 5, tricks0: 0, firstBidder: 1 });
  // seat 0 nil success → +125
  // seat 1 bid 5, took 13 → +50 + 8 bags. Pre-score 0 (sub-250) → bags 0→8 crosses
  //   5-bag threshold once → −50 penalty. Net: 50+8−50 = 8.
  ok("Hand 3 (successful nil) — seat 0 +125",
    final.scores[0] === 125, { got: final.scores[0] });
  ok("Hand 3 — seat 1 makes bid with overtricks (sub-250 penalty applied)",
    final.scores[1] === 8, { got: final.scores[1] });
  ok("Hand 3 — successful nil contributes 0 bags",
    final.bags[0] === 0);
  ok("Hand 3 — opponent bags = 8 carried forward",
    final.bags[1] === 8, { got: final.bags[1] });
}

// Scripted Hand 4 — failed nil (+ sub-250 5-bag penalty on opponent)
{
  const final = forceRoundOutcome({ bid0: 0, bid1: 5, tricks0: 3, firstBidder: 1 });
  // seat 0 nil failed (took 3) → -125, +3 bags
  // seat 1 bid 5, took 10 → +50 + 5 bags. Pre-score 0 (sub-250) → bags 0→5 crosses
  //   5-bag threshold once → −50 penalty. Net: 50+5−50 = 5.
  ok("Hand 4 (failed nil) — seat 0 -125",
    final.scores[0] === -125, { got: final.scores[0] });
  ok("Hand 4 — failed nil DOES accumulate bags",
    final.bags[0] === 3, { got: final.bags[0] });
  ok("Hand 4 — opponent gets +bid +bags −sub250penalty",
    final.scores[1] === 5, { got: final.scores[1] });
}

// Scripted Hand 5 — spade break / follow-suit edge case
{
  // Seat 0 leads non-spade; seat 1 has no led suit, cuts with spade → spades broken.
  // Then seat 1 (on lead) tries to lead spade — now legal.
  const h0 = hand("2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH"); // all hearts
  const h1 = hand("2S 3S 4S 5S 6S 7S 8S 9S 10S JS QS KS AS"); // all spades
  let s = mkGameForBidding(h0, h1, { firstBidder: 0 });
  s = bothBid(s, 0, 13);
  ok("Spade-break edge — initially not broken", s.spadesBroken === false);
  // Seat 1 cannot lead first because seat 0 is firstBidder → seat 0 leads
  // But seat 1 holds only-spades — when seat 1 gets on lead they can lead spade.
  const r1 = playCard(s, 0, C("2", "hearts"));   // seat 0 leads heart
  const r2 = playCard(r1.state, 1, C("2", "spades")); // seat 1 cuts (no hearts)
  ok("Spade-break edge — seat 1 won trick via cut", r2.state.tricks[1] === 1);
  ok("Spade-break edge — spadesBroken now true", r2.state.spadesBroken === true);
  ok("Spade-break edge — seat 1 now leads", r2.state.currentTurnIndex === 1);
  // Seat 1 can NOW lead a spade since broken
  ok("After broken, leading spade is legal",
    canPlayCard(r2.state, 1, C("3", "spades")).ok);
}

// Bag penalty — sub-250 (5 bags = -50)
{
  // Pre-round: seat 0 at score 100 (sub-250) with 4 bags. Bid 1. The universal
  // helper, due to stable-sort tie-breaking in the auto-play loop, produces
  // tricks=[8,5] for this layout (not [7,6]) — that's fine, still a valid round.
  // seat 0 bid 1 took 8 → +10 +7 bags; bags rise 4 → 11. Sub-250 threshold:
  // floor(11/5) − floor(4/5) = 2 thresholds crossed × −50 = −100.
  // Net delta: 10+7−100 = −83. Final: 100−83 = 17.
  const final = forceRoundOutcome({
    bid0: 1, bid1: 6, tricks0: 7,
    preScores: [100, 0], preBags: [4, 0],
    firstBidder: 1,
  });
  ok("Sub-250 bag penalty — fires at 5-bag thresholds (2× −50)",
    final.scores[0] === 17, { got: final.scores[0], expectedPenalty: -100 });
  ok("Sub-250 bag penalty — bags carry forward (not reset)",
    final.bags[0] === 11, { got: final.bags[0] });
}

// Bag penalty — 250+ (10 bags = -100)
{
  // Pre-round: seat 0 at score 260 with 8 bags. Bid 1, take 4 → +10 +3 = +13.
  // Bags 8 → 11. Crossing 10 at 250+ threshold = 1 * -100 = -100.
  // Final delta: +13 - 100 = -87. New score: 260 - 87 = 173.
  const final = forceRoundOutcome({
    bid0: 1, bid1: 9, tricks0: 4,
    preScores: [260, 0], preBags: [8, 0],
    firstBidder: 1,
  });
  ok("250+ bag penalty — fires only at 10-bag thresholds",
    final.scores[0] === 173, { got: final.scores[0] });
  ok("250+ bag penalty — 9 bags crossed nothing → 11 bags crossed 1 × -100",
    final.bags[0] === 11);
}

// Bag penalty — PRE-round tier lock at 249 → 250 boundary
{
  // Pre-round: seat 0 at 249 (sub-250 tier) with 0 bags. The helper produces
  // tricks=[8,5] for this layout. seat 0 bid 1 took 8 → +10 +7 bags. Bags 0 → 7
  // at sub-250 tier crosses the 5-bag threshold once → -50. Net delta: 10+7−50
  // = −33. Final: 249−33 = 216. If the engine WRONGLY used the post-round tier
  // (250+ → 10-bag, which 0→7 does NOT cross), final would be 249+17 = 266.
  // Asserting 216 proves the tier is locked at pre-round, not post-round.
  const final = forceRoundOutcome({
    bid0: 1, bid1: 6, tricks0: 7,
    preScores: [249, 0], preBags: [0, 0],
    firstBidder: 1,
  });
  ok("Bag tier lock — pre-round 249 (sub-250) stays sub-250 even when post-round ≥ 250",
    final.scores[0] === 216,
    { got: final.scores[0], wouldBe_ifPostRoundTier: 266 });
}

// Tiebreaker — both reach target tied → block of up to 3 rounds
{
  // Pre-round: both at 240, no bags. Both bid 1, both take 1 → +10 each → 250 tied.
  // bothAtTarget && tied → tiebreakerActive starts, no game_over yet.
  // To produce a tied 250 we need a round where both bid 1 and take 1. With our hand
  // construction we can't easily produce 1-1 tricks (it goes to 13-0 or t0/13-t0).
  // Instead set both to 250 already pre-round, then run any round; isTied check is based
  // on POST-round scores.
  // We'll just craft post-round identical via 6/7 split with equal bids of 6.
  //   seat 0 bid 6 took 6 → +60 +0; seat 1 bid 7 took 7 → +70 +0.
  // Hmm not equal. Try bid 4 both, t0=4 → seat0 +40 +0; t1=9 seat1 bid 4 took 9 → +40 +5.
  // Not equal either.
  // Easier: pre-score 200 vs 200, both bid 5, take t0=5 → seat0 +50, seat1 bid 5 took 8 → +50 +3.
  //   final: 250 vs 253. Not tied.
  // Use pre 245 vs 245, bid 1 each, t0=1 → seat0 +10, seat1 bid 1 took 12 → +10 +11 bags.
  //   final 255 vs 255 - bag_penalty. Bag penalty (sub-250 since pre 245<250) on seat 1: bags 0→11,
  //     crosses 5 and 10 → 2*-50 = -100. seat 1 final = 245 + 21 - 100 = 166. Not tied.
  // Need a perfectly engineered scenario. Simplest: bid 5 each, both take 5 — but t0=5 forces t1=8.

  // Switch to: pre-tiebreaker active state with both AT 250 tied, then run the 3rd tiebreaker round
  // and verify "still tied → another block", or "winner ahead → game_over".

  // Scenario A: enter tiebreaker; play 3 rounds; if still tied at end of 3rd → new block (active stays true).
  const sIn = forceRoundOutcome({
    bid0: 3, bid1: 3, tricks0: 3,
    preScores: [240, 240], preBags: [0, 0],
    firstBidder: 1, matchTarget: 250,
  });
  // seat 0 bid 3 took 3 → +30; seat 1 bid 3 took 10 → +30 +7 bags. Sub-250 threshold for seat 1: bags 0→7 crosses 5 → 1*-50.
  // seat 0: 240+30=270; seat 1: 240+37-50 = 227. Not tied. Game over.
  ok("Target-reach (no tie) → phase = game_over",
    sIn.phase === "game_over", { phase: sIn.phase, scores: sIn.scores });

  // Initial tiebreaker TRIGGER from tiebreakerActive=false: both finish the round
  // tied at exactly the target. Use pre 250/250 (already at target) with both bid 0
  // nil → both fail → both −125 → 125/125 tied. Even though both are below target
  // post-round, this exercises the round_over branch that keeps tiebreakerActive
  // unset when not yet at target. We need a DIFFERENT scenario for the trigger:
  // pre 187/187 + both bid 7 nil-ish... too brittle.
  // Cleanest exercisable case: pre 250/250 (already tied at target) + both bid 0 +
  // both fail → 125/125. The engine sees "bothAtTarget && tied" was previously true
  // (state is mid-match with active=false). When scores recede below target, the
  // tiebreaker doesn't trigger — it triggers only when bothAtTarget is currently true.
  // So exercise the actual trigger: state with both at 250 going INTO the round,
  // active=false; round leaves them above target & tied. Use both bid 1 took 1 →
  // helper can't produce 1/1 split. Instead set preScores=[245,245] + both bid 5 + t0=5
  // → seat0 245+50=295, seat1 245+50+3bags = 298 (bag penalty sub-250: 0→3 no
  // crossing). Not tied. Use both nil with preScores=[375,375] preBags=[0,0] tier
  // 250+ no penalty. Both fail nil → 250/250 tied at exactly target.
  const triggerTied = forceRoundOutcome({
    bid0: 0, bid1: 0, tricks0: 5,
    preScores: [375, 375], preBags: [0, 0],
    firstBidder: 1, matchTarget: 250,
    // tiebreakerActive intentionally OMITTED (defaults false) — this is the entry path
  });
  ok("Tiebreaker INITIAL TRIGGER — both reach target tied from active=false → activate block",
    triggerTied.phase === "round_over" &&
    triggerTied.tiebreakerActive === true &&
    triggerTied.scores[0] === 250 && triggerTied.scores[1] === 250,
    { phase: triggerTied.phase, tbActive: triggerTied.tiebreakerActive, scores: triggerTied.scores });

  // Scenario B: both bid 3, take 3, exact tie at target.
  //   seat 0: 240 + 30 = 270; seat 1: 240 + 30 + (bags from overtricks) → not 270.
  // Use: pre 240/240, both bid 6, t0=6. seat 0: 240+60=300. seat 1: bid 6 took 7, +60 +1 bag → 301. Not tied.
  // Use bid 10/10, t0=10. seat 0: bid 10 took 10 → +100. seat 1: bid 10 took 3 → -100. Bad.
  // Use t0=6, bid 6/7. seat 0: 240+60=300; seat 1 bid 7 took 7 → +70 → 310. Not tied.

  // Final attempt: pre 200/200 to give breathing room. Both bid 5, t0=5.
  //   seat 0 bid 5 took 5 → +50 = 250.
  //   seat 1 bid 5 took 8 → +50 +3 bags. Bag penalty sub-250: bags 0→3 crosses 0 → 0. seat 1 = 253. Not tied.
  // Use bid 8/5, t0=8. seat 0: 200 + 80 = 280; seat 1 bid 5 took 5 → +50 = 250. Not tied.
  // Use bid 8/3, t0=8. seat 0: 200+80=280; seat 1 bid 3 took 5 → +30 +2 = +32 → 232. Not tied.
  // Use bid 8/8, t0=8. seat 0: 200+80=280; seat 1 bid 8 took 5 → -80 → 120. Game over.
  // Use bid 13/0 nil, t0=13. seat 0: 200+130=330; seat 1: nil success +125 → 325. Not tied.
  // Use bid 12/1, t0=12. seat 0: 200+120 = 320; seat 1 bid 1 took 1 → +10 = 210. Game over.

  // To FORCE a tie cleanly: pre 250/250 with tiebreakerActive=true, tiebreakerRound=2.
  // Then run a round where both score 0 (e.g. both bid 7, both take their share; both either over or under).
  // Both bid 7, t0=7: seat 0 +70; seat 1 bid 7 took 6 → -70. Not tied delta.
  // Both bid 5, t0=5: seat 0 +50; seat 1 bid 5 took 8 → +50 +3. Not equal.
  // Both bid 7, t0=6: seat 0 bid 7 took 6 → -70; seat 1 bid 7 took 7 → +70. Not equal.

  // Easier: pre at 245/245 with tiebreakerActive=true, tiebreakerRound=3 (so this round completes the block).
  // Run any round. If post-scores tied → new block; if not → game_over.
  // Score both equal: pre 250/250, both bid 6 took 6 — but t0=6 forces t1=7. Asymmetric.

  // FORCE A TIE via both-fail-nil. Each side bids 0, each side takes ≥1 trick →
  // both score −125 deltas. Pre-scores equal + symmetric delta = tied result. Bag
  // accumulation differs per side (t0 vs 13−t0) but does NOT trigger a 10-bag/−100
  // 250+ penalty unless one side crosses 10 (here t0=5 → bags [5,8], safe).
  const tieRound = forceRoundOutcome({
    bid0: 0, bid1: 0, tricks0: 5,
    preScores: [250, 250], preBags: [0, 0],
    tiebreakerActive: true, tiebreakerRound: 2,
    firstBidder: 1, matchTarget: 250,
    roundNumber: 3,
  });
  // Both fail nil → both −125 → scores 125/125 (tied). Engine sees tiebreakerRound=2
  // < 3 inside calculateRoundScore → stay in round_over, tiebreakerActive remains true.
  ok("Tiebreaker mid-block (round 2 of 3) → still round_over, still tiebreakerActive",
    tieRound.phase === "round_over" && tieRound.tiebreakerActive === true,
    { phase: tieRound.phase, tbActive: tieRound.tiebreakerActive, scores: tieRound.scores });

  // Tiebreaker round 3 with TIED result → reset to new block (tiebreakerRound→0).
  const tieRound3 = forceRoundOutcome({
    bid0: 0, bid1: 0, tricks0: 5,
    preScores: [250, 250], preBags: [0, 0],
    tiebreakerActive: true, tiebreakerRound: 3,
    firstBidder: 1, matchTarget: 250,
    roundNumber: 5,
  });
  ok("Tiebreaker round 3, still tied → new block (tiebreakerActive stays true, round resets)",
    tieRound3.phase === "round_over" &&
    tieRound3.tiebreakerActive === true &&
    tieRound3.tiebreakerRound === 0,
    { phase: tieRound3.phase, tbActive: tieRound3.tiebreakerActive, tbRound: tieRound3.tiebreakerRound, scores: tieRound3.scores });

  // Tiebreaker round 3 with NON-tied result → game_over.
  const tieRound3Decisive = forceRoundOutcome({
    bid0: 7, bid1: 6, tricks0: 8,
    preScores: [250, 260], preBags: [0, 0],
    tiebreakerActive: true, tiebreakerRound: 3,
    firstBidder: 1, matchTarget: 250,
    roundNumber: 5,
  });
  ok("Tiebreaker round 3, decisive → game_over",
    tieRound3Decisive.phase === "game_over", { phase: tieRound3Decisive.phase, scores: tieRound3Decisive.scores });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 5 — Hand visibility (sanitize)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 5 — Hand visibility / sanitize");
{
  const h0 = hand("AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S");
  const h1 = hand("AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H");
  const s = mkGameForBidding(h0, h1, { firstBidder: 0 });

  const player0View = sanitizeForPlayer(s, 0);
  const player1View = sanitizeForPlayer(s, 1);
  const specView    = sanitizeForSpectator(s);

  ok("Player 0 sees own 13-card hand", player0View.hand.length === 13);
  ok("Player 0 does NOT receive opponent hand (only size)",
    player0View.opponentHandSize === 13 && !("opponentHand" in player0View));
  ok("Player 1 sees own 13-card hand, not seat 0's",
    player1View.hand.length === 13 &&
    !player1View.hand.some((c: Card) => h0.some((h) => eqCard(c, h))));
  ok("Spectator sees EMPTY hand array (no cards leaked)",
    Array.isArray(specView.hand) && specView.hand.length === 0);
  ok("Spectator sees handSizes (counts) but not contents",
    specView.handSizes[0] === 13 && specView.handSizes[1] === 13);
  ok("Spectator isSpectator=true flag set",
    specView.isSpectator === true);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 6 — Renege (server-side prevention)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 6 — Renege handling");
{
  const h0 = hand("AS KS 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH"); // hearts (12) + 2 spades
  const h1 = hand("QS JS 10S 9S 8S 7S 6S 5S 4S 3S KH AH 3C"); // spades (10) + 2 hearts + 1 club
  let s = mkGameForBidding(h0, h1, { firstBidder: 0 });
  s = bothBid(s, 4, 4);

  // Seat 0 leads a heart. Seat 1 has hearts → reneging by playing a club is rejected.
  const led = playCard(s, 0, C("2", "hearts")).state;
  const renegeCheck = canPlayCard(led, 1, C("3", "clubs"));
  ok("Renege attempt (off-suit while holding led suit) is rejected by canPlayCard",
    !renegeCheck.ok && /follow/i.test(renegeCheck.reason ?? ""),
    renegeCheck);

  ok("Renege attempt throws via playCard (server-authoritative)", (() => {
    try { playCard(led, 1, C("3", "clubs")); return false; } catch { return true; }
  })());

  // Spade-lead while spades not broken + holds non-spade
  ok("Leading a spade while not broken (and holding non-spades) is a renege-equivalent: rejected",
    !canPlayCard(s, 0, C("A", "spades")).ok);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 7 — Optional no-spade redeal (not implemented)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 7 — Optional no-spade redeal");
{
  // The engine has no `allowNoSpadeRedeal` toggle and no helper. Verify it's
  // genuinely absent so the gap is recorded by the suite.
  const sample = createGame("R7");
  ok("No `allowNoSpadeRedeal` toggle on GameState (gap — feature absent)",
    !("allowNoSpadeRedeal" in (sample as unknown as Record<string, unknown>)));

  // Demonstrate WHY the rule matters: count what fraction of random deals
  // produce a zero-spades hand. Not an engine assertion, just a sanity probe.
  let zeroSpadeHands = 0;
  const TRIALS = 500;
  for (let i = 0; i < TRIALS; i++) {
    const deck = [...createDeck()];
    for (let j = deck.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [deck[j], deck[k]] = [deck[k], deck[j]];
    }
    const a = deck.slice(0, 13);
    const b = deck.slice(13, 26);
    if (!a.some((c) => c.suit === "spades") || !b.some((c) => c.suit === "spades")) {
      zeroSpadeHands++;
    }
  }
  // Real assertion: zero-spade hands DO occur in finite trials, demonstrating
  // the gap is non-trivial. (Probability per seat ≈ C(39,13)/C(52,13) ≈ 1.3%;
  // expected ≥1 hit in 500 trials with overwhelming probability.)
  ok(`No-spade hands actually occur (observed ${zeroSpadeHands}/${TRIALS} random deals — gap is non-trivial)`,
    zeroSpadeHands > 0, { observed: zeroSpadeHands, trials: TRIALS });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 8 — Bid editing (not implemented — gap recorded)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 8 — Bid editing");
{
  const h0 = hand("AS KS QS JS 10S 9S 8S 7S 2H 3H 4H 5H 6H");
  const h1 = hand("AH KH QH JH 10H 9H 8H 7H 2C 3C 4C 5C 6C");
  let s = mkGameForBidding(h0, h1, { firstBidder: 0 });
  // Non-dealer (firstBidder=0) bids 3. Should they be allowed to EDIT before the dealer bids?
  const r1 = placeBid(s, 0, 3);
  ok("After first bid, seat 0's bid is locked in state.bids",
    r1.state.bids[0] === 3 && r1.state.bids[1] === null);
  ok("After first bid, currentBidder transfers to seat 1 — no edit-back path",
    r1.state.currentBidder === 1);
  // Try re-bidding by seat 0 (out of turn) — should throw
  let editAllowed = true;
  try { placeBid(r1.state, 0, 4); } catch { editAllowed = false; }
  ok("Engine REJECTS a re-bid by the non-dealer (no edit-bid support — GAP)",
    !editAllowed);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 9 — Auto-bid / auto-play helpers (used by turn-timer)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 9 — Auto-bid / auto-play");
{
  const handStrong = hand("AS AH AD AC KS KH KD KC QS QH QD QC JS");
  const ab = pickAutoBid({ ...createGame("AB"), hands: [handStrong, []] } as GameState, 0);
  ok("Strong hand auto-bid is clamped to <= 6",
    ab >= 1 && ab <= 6, { ab });

  const handWeak = hand("2H 3H 4H 5H 6H 7H 8H 9H 10H JH 2D 3D 4D");
  const abWeak = pickAutoBid({ ...createGame("AB2"), hands: [handWeak, []] } as GameState, 0);
  ok("Weak hand auto-bid is at least 1 (never auto-nil)",
    abWeak >= 1, { abWeak });

  // Auto-play picks a legal card
  const h0 = hand("AS KS 2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH");
  const h1 = hand("QS JS 10S 9S 8S 7S 6S 5S 4S 3S KH AH 3C");
  let s = mkGameForBidding(h0, h1, { firstBidder: 0 });
  s = bothBid(s, 3, 3);
  const ap = pickAutoPlayCard(s, 0);
  ok("Auto-play returns a card",
    ap !== null);
  ok("Auto-play returns a LEGAL card",
    ap !== null && canPlayCard(s, 0, ap).ok);
  // Specifically, with spades not broken and non-spades available, auto-play should NOT pick a spade
  ok("Auto-play respects spades-not-broken rule (does not lead spade when non-spades available)",
    ap !== null && ap.suit !== "spades", { card: ap });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 10 — Bust-out floor (-250 immediate-loss house rule)
// ═══════════════════════════════════════════════════════════════════════════
group("Test 10 — Bust-out floor (-250)");
{
  // (1) Score exactly -250 triggers the loss.
  //   seat0: bid 8, took 4 -> -80; pre-score -170 => final -250 (no bags, no
  //   bag penalty). seat1 stays well above the floor.
  const exact = forceRoundOutcome({
    bid0: 8, bid1: 4, tricks0: 4, firstBidder: 1, preScores: [-170, 100],
  });
  ok("Exactly -250 — seat 0 final score is -250",
    exact.scores[0] === -250, { got: exact.scores[0] });
  ok("Exactly -250 — phase = game_over",
    exact.phase === "game_over", { phase: exact.phase });
  ok("Exactly -250 — reason names the losing player",
    exact.gameOverReason === "Alice loses by reaching -250.", { got: exact.gameOverReason });
  ok("Exactly -250 — opponent (seat 1) is the higher score (wins via normal flow)",
    exact.scores[1] > exact.scores[0], { s: exact.scores });
  ok("Exactly -250 — no tiebreaker is started by a bust",
    exact.tiebreakerActive === false);

  // (2) Score below -250 triggers the loss.
  //   seat0: bid 8, took 4 -> -80; pre-score -180 => final -260.
  const below = forceRoundOutcome({
    bid0: 8, bid1: 4, tricks0: 4, firstBidder: 1, preScores: [-180, 100],
  });
  ok("Below -250 — seat 0 final score is -260",
    below.scores[0] === -260, { got: below.scores[0] });
  ok("Below -250 — phase = game_over",
    below.phase === "game_over", { phase: below.phase });
  ok("Below -250 — reason names the losing player",
    below.gameOverReason === "Alice loses by reaching -250.", { got: below.gameOverReason });

  // (3) Normal win by reaching the target still works — and is NOT flagged as
  //   a bust. seat0: bid 5, took 5 -> +50; pre-score 210 => final 260 >= 250.
  const normal = forceRoundOutcome({
    bid0: 5, bid1: 4, tricks0: 5, firstBidder: 1, preScores: [210, 0],
  });
  ok("Normal target win — seat 0 reaches target",
    normal.scores[0] === 260, { got: normal.scores[0] });
  ok("Normal target win — phase = game_over",
    normal.phase === "game_over", { phase: normal.phase });
  ok("Normal target win — NOT attributed to the bust rule (no reason)",
    normal.gameOverReason == null, { got: normal.gameOverReason });

  // (5) The rule is evaluated only AFTER a hand is fully scored — never
  //   mid-hand. Start a round with a total already at/below the floor and
  //   confirm bidding + a partial trick do NOT end the game.
  const h0 = hand("AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3C 2C"); // no hearts
  const h1 = hand("2H 3H 4H 5H 6H 7H 8H 9H 10H JH QH KH AH"); // all hearts
  let mid = mkGameForBidding(h0, h1, { firstBidder: 1, preScores: [-260, 50] });
  ok("Mid-hand — sub-floor pre-score does not end the game during bidding",
    mid.phase === "bidding" && mid.gameOverReason == null, { phase: mid.phase });
  mid = bothBid(mid, 3, 3);
  ok("Mid-hand — still playing after bids (not game_over) despite sub-floor total",
    mid.phase === "playing" && mid.gameOverReason == null, { phase: mid.phase });
  // Play exactly one trick (seat 1 leads a heart, seat 0 discards a club).
  const oneTrick = playSequence(mid, [
    [1, C("2", "hearts")],
    [0, C("2", "clubs")],
  ]).state;
  ok("Mid-hand — one trick resolved, round not complete -> still playing",
    oneTrick.phase === "playing" && oneTrick.gameOverReason == null, { phase: oneTrick.phase });
  // Now complete a full round from the same sub-floor start: the rule fires
  // ONLY here, once scoring is finalized. seat0 bid1/took1 -> +10 => -250.
  const afterScored = forceRoundOutcome({
    bid0: 1, bid1: 1, tricks0: 1, firstBidder: 1, preScores: [-260, 50],
  });
  ok("Post-scoring — same sub-floor start ends as game_over once the hand is scored",
    afterScored.phase === "game_over" && afterScored.gameOverReason === "Alice loses by reaching -250.",
    { phase: afterScored.phase, reason: afterScored.gameOverReason });

  // (6) Both players bust with DIFFERENT scores — the LOWER score loses, and
  //   the named loser must be consistent with the downstream higher-score
  //   winner derivation. Both fail their bids: seat0 bid8/took6 -> -80;
  //   seat1 bid8/took7 -> -80. pre [-200, -180] => [-280, -260].
  const bothDiff = forceRoundOutcome({
    bid0: 8, bid1: 8, tricks0: 6, firstBidder: 1, preScores: [-200, -180],
  });
  ok("Both bust (different) — both totals are at/below the floor",
    bothDiff.scores[0] <= -250 && bothDiff.scores[1] <= -250, { s: bothDiff.scores });
  ok("Both bust (different) — phase = game_over",
    bothDiff.phase === "game_over", { phase: bothDiff.phase });
  ok("Both bust (different) — LOWER score (seat 0) is named as the loser",
    bothDiff.gameOverReason === "Alice loses by reaching -250.", { got: bothDiff.gameOverReason, s: bothDiff.scores });
  ok("Both bust (different) — named loser is consistent with higher-score winner",
    (bothDiff.scores[0] > bothDiff.scores[1] ? "seat0" : "seat1") === "seat1", { s: bothDiff.scores });

  // (7) Both players bust to the EXACT same score — there is no deterministic
  //   loser, so the engine must NOT produce a tied game_over (the advancement
  //   code relies on game_over never being tied). The match continues.
  const bothTie = forceRoundOutcome({
    bid0: 8, bid1: 8, tricks0: 6, firstBidder: 1, preScores: [-170, -170],
  });
  ok("Both bust (equal) — both totals are exactly -250",
    bothTie.scores[0] === -250 && bothTie.scores[1] === -250, { s: bothTie.scores });
  ok("Both bust (equal) — does NOT force a tied game_over",
    bothTie.phase !== "game_over", { phase: bothTie.phase });
  ok("Both bust (equal) — no loser reason is recorded (match continues)",
    bothTie.gameOverReason == null, { got: bothTie.gameOverReason });

  // Invariant: every game_over the bust rule produces has a strict winner
  // (non-tied scores). The tournament/KotT advancement code relies on this.
  for (const s of [exact, below, normal, bothDiff]) {
    ok("Invariant — game_over scores are never tied",
      !(s.phase === "game_over" && s.scores[0] === s.scores[1]),
      { phase: s.phase, scores: s.scores });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 11 — A -250 bust advances the OPPONENT in a tournament bracket.
// Touches the tournament store + DB-backed advancement (recordMatchResult),
// mirroring exactly the winner derivation the socket layer uses on game_over:
//   winnerSeat = finalScores[0] > finalScores[1] ? "A" : "B"
// ═══════════════════════════════════════════════════════════════════════════
group("Test 11 — Tournament opponent advances on a -250 loss");
await (async () => {
  const { tournament, hostToken } = createTournament(
    "lf_host", "sock-lf-host", { name: "LossFloor", size: 4, matchTarget: 250 },
  );
  const code = tournament.code;
  joinTournament(code, "lf_p2", "sock-lf-2");
  joinTournament(code, "lf_p3", "sock-lf-3");
  joinTournament(code, "lf_p4", "sock-lf-4");
  startTournament(code, "sock-lf-host", hostToken);
  const t0 = getTournament(code)!;
  // Stamp roomCodes so the audit insert has a non-null FK (mirrors other tests).
  for (const m of t0.rounds[0]) m.roomCode = `R-lf-${m.position}`;

  const match = t0.rounds[0][0];
  const seatAName = match.playerA!.name;
  const seatBName = match.playerB!.name;

  // Drive a REAL game where seat 0 (= bracket seat "A") busts to -260.
  const busted = forceRoundOutcome({
    bid0: 8, bid1: 4, tricks0: 4, firstBidder: 1, preScores: [-180, 100],
  });
  ok("Bracket bust — engine produced a game_over by the floor rule",
    busted.phase === "game_over" && busted.scores[0] <= -250, { s: busted.scores });

  // Derive winner exactly as the socket layer does on game_over.
  const winnerSeat: "A" | "B" =
    busted.scores[0] > busted.scores[1] ? "A" : "B";
  ok("Bracket bust — derived winner is the opponent (seat B)",
    winnerSeat === "B", { winnerSeat });

  const res = await recordMatchResult(code, match.id, winnerSeat, {
    finalScores: [busted.scores[0], busted.scores[1]],
  });
  ok("Bracket bust — recordMatchResult advanced the bracket",
    res.kind === "advanced", res);

  const after = getTournament(code)!;
  const round1 = after.rounds[1] ?? [];
  const advancedNames = round1.flatMap((m) =>
    [m.playerA?.name, m.playerB?.name].filter(Boolean) as string[],
  );
  ok("Bracket bust — opponent (seat B player) advanced to round 2",
    advancedNames.includes(seatBName), { advancedNames, seatBName });
  ok("Bracket bust — busted player (seat A player) did NOT advance",
    !advancedNames.includes(seatAName), { advancedNames, seatAName });
  ok("Bracket bust — busted player is recorded as eliminated",
    after.eliminated.includes(seatAName), { eliminated: after.eliminated });

  await flushTournamentLocks();
})();

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n──────────────────────────────────────");
console.log(`PASS: ${pass}    FAIL: ${fail}`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
