/**
 * Pre-June-1 bugfix #7 — Bracket score capture & display.
 *
 * recordMatchResult now accepts an optional `finalScores: [number, number]`
 * opt that writes through to the resolved match's `scoreA` / `scoreB`
 * fields so the bracket UI can render "253–188" next to each pair.
 *
 * Asserts:
 *   - default (no opts) leaves scoreA/scoreB null (back-compat)
 *   - opts.finalScores writes through to the resolved match
 *   - replay path does NOT overwrite scores with a second call
 *   - empty bracket matches are initialized with scoreA/scoreB = null
 *
 * Run with:
 *   ./artifacts/spades-game/node_modules/.bin/tsx --test \
 *     artifacts/api-server/src/game/__tests__/bracket-score.test.mts
 */
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
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}`, detail ?? "");
  }
}

async function seed(prefix: string) {
  const { tournament, hostToken } = createTournament(
    `${prefix}_host`,
    `sock-${prefix}-host`,
    { name: `${prefix} BSC`, size: 4, matchTarget: 250 },
  );
  const code = tournament.code;
  joinTournament(code, `${prefix}_p2`, `sock-${prefix}-2`);
  joinTournament(code, `${prefix}_p3`, `sock-${prefix}-3`);
  joinTournament(code, `${prefix}_p4`, `sock-${prefix}-4`);
  startTournament(code, `sock-${prefix}-host`, hostToken);
  // Stamp roomCodes so recordMatchResult's audit insert has a non-null FK.
  const t = getTournament(code)!;
  for (const m of t.rounds[0]) {
    m.roomCode = `R-${prefix}-${m.position}`;
  }
  return { code, hostToken };
}

(async () => {
  console.log("\n── Bracket score capture ──");

  // ── Test 1: empty bracket is initialized with nulls ────────────────────
  {
    const { code } = await seed("BSC1");
    const t = getTournament(code)!;
    const allNull = t.rounds.every((round) =>
      round.every((m) => m.scoreA === null && m.scoreB === null),
    );
    ok("All bracket matches initialized with scoreA/scoreB = null", allNull);
  }

  // ── Test 2: no opts → scores stay null (back-compat) ───────────────────
  {
    const { code } = await seed("BSC2");
    const t = getTournament(code)!;
    const m = t.rounds[0][0];
    const res = await recordMatchResult(code, m.id, "A");
    ok("recordMatchResult(no opts) → kind=advanced", res.kind === "advanced", res);
    ok(
      "scoreA stays null when no finalScores opt passed",
      m.scoreA === null,
      `scoreA=${m.scoreA}`,
    );
    ok(
      "scoreB stays null when no finalScores opt passed",
      m.scoreB === null,
      `scoreB=${m.scoreB}`,
    );
  }

  // ── Test 3: finalScores writes through ─────────────────────────────────
  {
    const { code } = await seed("BSC3");
    const t = getTournament(code)!;
    const m = t.rounds[0][0];
    const res = await recordMatchResult(code, m.id, "A", {
      finalScores: [253, 188],
    });
    ok("recordMatchResult(finalScores) → kind=advanced", res.kind === "advanced");
    ok("scoreA = 253", m.scoreA === 253, `scoreA=${m.scoreA}`);
    ok("scoreB = 188", m.scoreB === 188, `scoreB=${m.scoreB}`);
    ok("winner = A (preserved)", m.winner === "A");
  }

  // ── Test 4: replay path does NOT change scores ─────────────────────────
  {
    const { code } = await seed("BSC4");
    const t = getTournament(code)!;
    const m = t.rounds[0][0];
    await recordMatchResult(code, m.id, "B", { finalScores: [120, 251] });
    const beforeA = m.scoreA;
    const beforeB = m.scoreB;
    // Replay with same winner but different "scores" — replay should be a no-op.
    const replay = await recordMatchResult(code, m.id, "B", {
      finalScores: [999, 999],
    });
    ok("Replay returns kind=replay", replay.kind === "replay");
    ok("scoreA unchanged after replay", m.scoreA === beforeA, `was ${beforeA}, now ${m.scoreA}`);
    ok("scoreB unchanged after replay", m.scoreB === beforeB, `was ${beforeB}, now ${m.scoreB}`);
  }

  // ── Test 5: conflict path doesn't half-apply ───────────────────────────
  {
    const { code } = await seed("BSC5");
    const t = getTournament(code)!;
    const m = t.rounds[0][0];
    await recordMatchResult(code, m.id, "A", { finalScores: [251, 100] });
    const beforeA = m.scoreA;
    const beforeB = m.scoreB;
    const conflict = await recordMatchResult(code, m.id, "B", {
      finalScores: [0, 999],
    });
    ok("Conflict returns kind=rejected", conflict.kind === "rejected");
    ok("scoreA preserved on conflict", m.scoreA === beforeA);
    ok("scoreB preserved on conflict", m.scoreB === beforeB);
    ok("winner preserved on conflict", m.winner === "A");
  }

  flushTournamentLocks();
  console.log(`\n──────────────────────────────────────`);
  console.log(`PASS: ${pass}    FAIL: ${fail}`);
  if (fail > 0) {
    console.error("Failures:", failures);
    process.exit(1);
  }
})();
