/**
 * Full 32-player single-elimination tournament simulation.
 *
 * Drives the REAL tournament advancement path — `startTournament` (random
 * seeding) → `recordMatchResult` (the exact function the live
 * `advanceTournamentOnGameOver` game-over hook calls) → champion — and
 * asserts every bracket invariant round by round. No gameplay, scoring,
 * socket, or advancement logic is modified; this only observes.
 *
 * Runs against the live DEV database (recordMatchResult commits via
 * recordMatchResultTx). Uses a unique tournament code and cleans up after.
 *
 * Run with:  npx tsx artifacts/api-server/src/game/__tests__/tournament-32-sim.mts
 */
import {
  createTournament,
  joinTournament,
  startTournament,
  recordMatchResult,
  getTournament,
  sanitizeTournament,
  flushTournamentLocks,
  type BracketSeat,
  type TournamentMatch,
} from "../tournament.js";
import { deleteTournamentMatches } from "../persistence.js";

// ── tiny assertion harness ──────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(label + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""));
    console.log(`  ✗ ${label}`, detail ?? "");
  }
}

const ROUND_LABELS = ["Round 1", "Round 2", "Quarterfinals", "Semifinals", "Finals"];
const EXPECTED_PER_ROUND = [16, 8, 4, 2, 1];
const TOTAL_EXPECTED = 31;

// Deep-scan any object for a key that looks like a secret token.
function hasTokenLeak(obj: unknown): boolean {
  let leaked = false;
  const walk = (v: unknown) => {
    if (leaked || v === null || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/token/i.test(k) && val != null && val !== "") {
        leaked = true;
        return;
      }
      walk(val);
    }
  };
  walk(obj);
  return leaked;
}

async function main() {
  // ── 1) Create the tournament (admin-style: no in-roster host) ──────────
  const { tournament: t0, hostToken } = createTournament("", "", {
    name: "32P Simulation",
    size: 32,
    matchTarget: 250,
    seedHost: false,
  });
  const code = t0.code;
  ok("hostToken issued to creator (kept server-side only)", typeof hostToken === "string" && hostToken.length > 0);

  // ── 2) Create 32 fake players and join them ────────────────────────────
  const playerTokens = new Map<string, string>();
  for (let i = 1; i <= 32; i++) {
    const name = `Player ${String(i).padStart(2, "0")}`;
    const { token } = joinTournament(code, name, `sock_${i}`);
    playerTokens.set(name, token);
  }
  const t = getTournament(code)!;
  ok("32 players registered", t.players.length === 32, t.players.length);

  // ── 13) Sanitized lobby state leaks no tokens to players/spectators ────
  const lobbySnapshot = sanitizeTournament(t);
  ok("lobby sanitize: no token field on any player", !hasTokenLeak(lobbySnapshot));
  ok(
    "lobby sanitize: players expose only id + name",
    (lobbySnapshot.players as Array<Record<string, unknown>>).every(
      (p) => Object.keys(p).sort().join(",") === "id,name",
    ),
  );

  // ── 3 + 4) Start the tournament (random seeding) ───────────────────────
  startTournament(code, "sock_admin");
  ok("status is in_progress after start", t.status === "in_progress");
  ok("bracket has 5 rounds", t.rounds.length === 5, t.rounds.length);
  ok(
    "round sizes are 16/8/4/2/1",
    t.rounds.every((r, i) => r.length === EXPECTED_PER_ROUND[i]),
    t.rounds.map((r) => r.length),
  );
  ok(
    "Round 1 fully seeded (every match has both players)",
    t.rounds[0].every((m) => m.playerA && m.playerB),
  );

  // Seeding integrity: all 32 distinct names appear exactly once in Round 1.
  const seededNames = t.rounds[0].flatMap((m) => [m.playerA!.name, m.playerB!.name]);
  ok("Round 1 contains all 32 unique players", new Set(seededNames).size === 32, new Set(seededNames).size);

  // ── 5 + 6 + 7 + 8 + 9) Resolve every match, round by round ─────────────
  const roundWinners: string[][] = [];
  let totalCompleted = 0;
  const eliminatedSeen = new Set<string>();
  let advancementErrors = 0;

  for (let r = 0; r < t.rounds.length; r++) {
    const round = t.rounds[r];

    // (8) No duplicate players within this round.
    const namesThisRound = round.flatMap((m) =>
      [m.playerA?.name, m.playerB?.name].filter((x): x is string => !!x),
    );
    ok(
      `${ROUND_LABELS[r]}: no duplicate players`,
      new Set(namesThisRound).size === namesThisRound.length,
      namesThisRound.length - new Set(namesThisRound).size,
    );

    // (9) No already-eliminated player appears in this round.
    const intruder = namesThisRound.find((n) => eliminatedSeen.has(n));
    ok(`${ROUND_LABELS[r]}: no eliminated player present`, !intruder, intruder);

    const winnersThisRound: string[] = [];
    for (let p = 0; p < round.length; p++) {
      const match = round[p];
      ok(
        `${ROUND_LABELS[r]} M${p + 1}: both players present before play`,
        !!match.playerA && !!match.playerB,
        match.id,
      );
      // Randomly pick the winning seat to exercise both A and B advancement.
      const winnerSeat: BracketSeat = Math.random() < 0.5 ? "A" : "B";
      const expectedWinnerName = winnerSeat === "A" ? match.playerA!.name : match.playerB!.name;
      const expectedLoserName = winnerSeat === "A" ? match.playerB!.name : match.playerA!.name;
      const finalScores: [number, number] = winnerSeat === "A" ? [250, 110] : [110, 250];

      const res = await recordMatchResult(code, match.id, winnerSeat, { finalScores });
      if (res.kind !== "advanced") {
        advancementErrors++;
        ok(`${ROUND_LABELS[r]} M${p + 1}: recordMatchResult advanced`, false, res);
        continue;
      }
      totalCompleted++;
      winnersThisRound.push(expectedWinnerName);

      // (9) Track elimination + verify the winner was never previously out.
      ok(
        `${ROUND_LABELS[r]} M${p + 1}: winner not previously eliminated`,
        !eliminatedSeen.has(expectedWinnerName),
        expectedWinnerName,
      );
      eliminatedSeen.add(expectedLoserName);
      // Authoritative check: recordMatchResult must append exactly this loser
      // to t.eliminated (catches a bug that writes the wrong/extra names).
      ok(
        `${ROUND_LABELS[r]} M${p + 1}: loser appended to t.eliminated`,
        t.eliminated.length === eliminatedSeen.size &&
          t.eliminated[t.eliminated.length - 1] === expectedLoserName,
        { last: t.eliminated[t.eliminated.length - 1], expected: expectedLoserName, len: t.eliminated.length },
      );

      // (7) Winner advances to the correct next-round slot (or becomes champ).
      const isFinal = r === t.rounds.length - 1;
      if (!isFinal) {
        const next = t.rounds[r + 1][Math.floor(p / 2)];
        const landedSeat = p % 2 === 0 ? next.playerA : next.playerB;
        ok(
          `${ROUND_LABELS[r]} M${p + 1}: winner advanced to ${next.id} seat ${p % 2 === 0 ? "A" : "B"}`,
          landedSeat?.name === expectedWinnerName,
          { expected: expectedWinnerName, got: landedSeat?.name },
        );
      } else {
        ok("Finals: champion crowned with winner name", t.champion === expectedWinnerName, {
          champion: t.champion,
          expected: expectedWinnerName,
        });
      }
    }
    roundWinners.push(winnersThisRound);
    ok(
      `${ROUND_LABELS[r]}: completed ${EXPECTED_PER_ROUND[r]} matches`,
      winnersThisRound.length === EXPECTED_PER_ROUND[r],
      winnersThisRound.length,
    );
  }

  await flushTournamentLocks();

  // ── 6 + 10 + 11) Totals, champion, completion status ───────────────────
  ok("31 / 31 matches completed", totalCompleted === TOTAL_EXPECTED, totalCompleted);
  ok("no advancement errors", advancementErrors === 0, advancementErrors);
  ok("status is complete", t.status === "complete", t.status);
  ok("completedAt timestamp set (bracket-complete status)", typeof t.completedAt === "number" && t.completedAt! > 0);
  ok("exactly one champion", typeof t.champion === "string" && t.champion.length > 0, t.champion);
  ok("31 players eliminated", t.eliminated.length === 31, t.eliminated.length);
  ok("eliminated list has no duplicates", new Set(t.eliminated).size === t.eliminated.length);
  ok(
    "t.eliminated set-equals all expected losers (every non-champion player)",
    t.eliminated.length === eliminatedSeen.size &&
      [...eliminatedSeen].every((n) => t.eliminated.includes(n)),
  );
  ok(
    "the 32 players == 31 eliminated + 1 champion (no one lost or duplicated)",
    new Set([...t.eliminated, t.champion!]).size === 32,
  );
  ok("champion is NOT in the eliminated list", !t.eliminated.includes(t.champion!));
  ok(
    "champion is the Finals winner",
    t.rounds[4][0].winnerName === t.champion,
    { finalsWinner: t.rounds[4][0].winnerName, champion: t.champion },
  );

  // ── 12) Host/admin tools did NOT touch the simulation ──────────────────
  ok("no host/admin audit entries (pure auto-advancement)", t.adminAuditLog.length === 0, t.adminAuditLog.length);

  // ── 13) Final sanitized state still leaks no tokens ────────────────────
  const finalSnapshot = sanitizeTournament(t);
  ok("final sanitize: no token leak", !hasTokenLeak(finalSnapshot));
  // Structural blind-spot guards: known secret-bearing keys must be absent
  // regardless of whether their name contains "token".
  const topKeys = Object.keys(finalSnapshot as Record<string, unknown>);
  ok("final sanitize: no hostToken / adminAuditLog / hostSocketId keys", !topKeys.some((k) => /hostToken|adminAuditLog|hostSocketId/.test(k)));
  ok(
    "final sanitize: no player exposes token or pendingAssignment",
    (finalSnapshot.players as Array<Record<string, unknown>>).every(
      (p) => !("token" in p) && !("pendingAssignment" in p) && !("socketId" in p),
    ),
  );
  ok("final sanitize: champion present", finalSnapshot.champion === t.champion);

  // ── 14) Report ─────────────────────────────────────────────────────────
  const finalsMatch = t.rounds[4][0];
  console.log("\n" + "═".repeat(60));
  console.log("  32-PLAYER TOURNAMENT SIMULATION REPORT");
  console.log("═".repeat(60));
  console.log(`  Tournament code/id : ${code}`);
  console.log(`  Name               : ${t.name}`);
  console.log(`  Players created    : 32`);
  console.log(`  Matches expected   : ${TOTAL_EXPECTED}`);
  console.log(`  Matches completed  : ${totalCompleted}`);
  console.log("  " + "-".repeat(56));
  for (let r = 0; r < roundWinners.length; r++) {
    console.log(`  ${ROUND_LABELS[r]} winners (${roundWinners[r].length}):`);
    const w = roundWinners[r];
    for (let i = 0; i < w.length; i += 4) {
      console.log("    " + w.slice(i, i + 4).join(", "));
    }
  }
  console.log("  " + "-".repeat(56));
  console.log(`  Final matchup      : ${finalsMatch.playerA?.name} vs ${finalsMatch.playerB?.name}`);
  console.log(`  Final score        : ${finalsMatch.scoreA}–${finalsMatch.scoreB}`);
  console.log(`  CHAMPION           : 🏆 ${t.champion}`);
  console.log("  " + "-".repeat(56));
  console.log(`  Assertions passed  : ${pass}`);
  console.log(`  Assertions failed  : ${fail}`);
  if (failures.length) {
    console.log("\n  FAILED ASSERTIONS:");
    for (const f of failures) console.log(`    ✗ ${f}`);
  }
  console.log("═".repeat(60));

  // ── cleanup: remove DB rows + in-memory tournament ─────────────────────
  try {
    await deleteTournamentMatches(code);
  } catch (e) {
    console.log("  (cleanup warning)", (e as Error).message);
  }

  const passed = fail === 0 && totalCompleted === TOTAL_EXPECTED && !!t.champion;
  console.log(`\n  RESULT: ${passed ? "PASS ✓ — 31/31 matches, one champion crowned" : "FAIL ✗"}\n`);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("Simulation crashed:", e);
  process.exit(1);
});
