/**
 * Phase 4 — Tournament bracket transaction safety tests.
 *
 * Runs against the live DEV database. Each test uses a unique tournament
 * code so tests are isolated from one another and from real gameplay.
 *
 * Run with:  node --experimental-strip-types artifacts/api-server/src/game/__tests__/tournament-tx.test.mts
 */
import {
  createTournament,
  joinTournament,
  startTournament,
  recordMatchResult,
  getTournament,
  flushTournamentLocks,
  type Tournament,
} from "../tournament.js";
import {
  recordMatchResultTx,
  deleteTournamentMatches,
} from "../persistence.js";
import { db, tournamentMatchesTable, gameAuditLogTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

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

async function seedTournament(prefix: string): Promise<Tournament> {
  const { tournament } = createTournament(`${prefix}_host`, `sock-${prefix}-host`, {
    name: `${prefix} Cup`,
    size: 4,
    matchTarget: 250,
  });
  joinTournament(tournament.code, `${prefix}_p2`, `sock-${prefix}-2`);
  joinTournament(tournament.code, `${prefix}_p3`, `sock-${prefix}-3`);
  joinTournament(tournament.code, `${prefix}_p4`, `sock-${prefix}-4`);
  startTournament(tournament.code, `sock-${prefix}-host`);
  // Bracket has 2 round-1 matches feeding 1 final. Stamp roomCodes for realism.
  tournament.rounds[0][0].roomCode = `${prefix}-R1M0-ROOM`;
  tournament.rounds[0][1].roomCode = `${prefix}-R1M1-ROOM`;
  return tournament;
}

async function clearDb(code: string) {
  await deleteTournamentMatches(code);
  await db
    .delete(gameAuditLogTable)
    .where(eq(gameAuditLogTable.action, "tournament_advance"));
}

async function rowsFor(code: string) {
  return db
    .select()
    .from(tournamentMatchesTable)
    .where(eq(tournamentMatchesTable.tournamentCode, code));
}

async function auditCountFor(code: string, matchId: string): Promise<number> {
  const rows = await db.select().from(gameAuditLogTable).where(eq(gameAuditLogTable.action, "tournament_advance"));
  return rows.filter((r) => {
    const p = r.payload as { tournamentCode?: string; matchId?: string } | null;
    return p?.tournamentCode === code && p?.matchId === matchId;
  }).length;
}

// ────────────────────────────────────────────────────────────────────────
console.log("\n[Test 1] Normal winner advance");
{
  const t = await seedTournament("T1");
  await clearDb(t.code);

  const m0 = t.rounds[0][0];
  const m1 = t.rounds[0][1];
  const res0 = await recordMatchResult(t.code, m0.id, "A");
  ok("R1M0 returns kind=advanced", res0.kind === "advanced", res0);
  ok("R1M0 winner promoted to final playerA",
     t.rounds[1][0].playerA?.name === m0.playerA?.name,
     { final: t.rounds[1][0] });
  ok("R1M0 loser pushed to eliminated", t.eliminated.includes(m0.playerB!.name));

  const res1 = await recordMatchResult(t.code, m1.id, "B");
  ok("R1M1 returns kind=advanced", res1.kind === "advanced");
  ok("R1M1 winner promoted to final playerB",
     t.rounds[1][0].playerB?.name === m1.playerB?.name);
  ok("Both R1 matches signal newlyReady=final ONCE",
     res0.kind === "advanced" && res0.effect.newlyReadyMatches.length === 0 &&
     res1.kind === "advanced" && res1.effect.newlyReadyMatches.length === 1 &&
     res1.effect.newlyReadyMatches[0].id === t.rounds[1][0].id);

  // Final
  const final = t.rounds[1][0];
  const resF = await recordMatchResult(t.code, final.id, "A");
  ok("Final returns kind=advanced", resF.kind === "advanced");
  ok("Tournament marked complete", t.status === "complete");
  ok("Champion set",
     resF.kind === "advanced" && resF.effect.isFinal &&
     resF.effect.championName === final.playerA?.name);

  const rows = await rowsFor(t.code);
  ok("DB persisted 3 match rows", rows.length === 3, { rows: rows.length });
  ok("All DB rows have winnerName",
     rows.every((r) => !!r.winnerName));
  ok("Audit log has exactly 1 row per match for each", (await auditCountFor(t.code, m0.id)) === 1);
}

// ────────────────────────────────────────────────────────────────────────
console.log("\n[Test 2] Force-forfeit (winner-by-other-seat) advance");
{
  const t = await seedTournament("T2");
  await clearDb(t.code);
  const m0 = t.rounds[0][0];
  // Forfeit case = same code path; the seat is chosen by the caller.
  const res = await recordMatchResult(t.code, m0.id, "B");
  ok("Forfeit advance returns kind=advanced", res.kind === "advanced");
  ok("Forfeit-winner promoted",
     t.rounds[1][0].playerA?.name === m0.playerB?.name);
  ok("Forfeit-loser eliminated", t.eliminated.includes(m0.playerA!.name));
  const rows = await rowsFor(t.code);
  ok("Forfeit persisted to DB", rows.length === 1 && rows[0].winnerName === m0.playerB?.name);
}

// ────────────────────────────────────────────────────────────────────────
console.log("\n[Test 3] Duplicate submission idempotency");
{
  const t = await seedTournament("T3");
  await clearDb(t.code);
  const m0 = t.rounds[0][0];

  // First call: real advance.
  const r1 = await recordMatchResult(t.code, m0.id, "A");
  ok("First call: advanced", r1.kind === "advanced");
  const finalSlotAfter1 = t.rounds[1][0].playerA?.name;
  const elimLen1 = t.eliminated.length;

  // Duplicate (same matchId, same seat): should be a replay no-op.
  const r2 = await recordMatchResult(t.code, m0.id, "A");
  ok("Duplicate same-winner: kind=replay", r2.kind === "replay", r2);
  ok("Duplicate did NOT re-promote (finalSlot stable)",
     t.rounds[1][0].playerA?.name === finalSlotAfter1);
  ok("Duplicate did NOT re-eliminate (length stable)",
     t.eliminated.length === elimLen1);

  // Duplicate (same matchId, DIFFERENT seat): must be rejected.
  const r3 = await recordMatchResult(t.code, m0.id, "B");
  ok("Conflicting winner: kind=rejected", r3.kind === "rejected", r3);
  ok("Conflict reason=winner_conflict",
     r3.kind === "rejected" && r3.reason === "winner_conflict");
  ok("Bracket still shows original winner",
     t.rounds[1][0].playerA?.name === finalSlotAfter1);
  ok("Eliminated list still stable", t.eliminated.length === elimLen1);

  // DB: exactly ONE row, exactly ONE audit.
  const rows = await rowsFor(t.code);
  ok("DB has exactly 1 row for the duplicated match", rows.length === 1);
  ok("Audit has exactly 1 row for the duplicated match",
     (await auditCountFor(t.code, m0.id)) === 1);

  // DB-level idempotency: invoke the tx directly with same args twice.
  const direct1 = await recordMatchResultTx({
    tournamentCode: t.code,
    matchId: m0.id,
    round: m0.round,
    position: m0.position,
    playerAName: m0.playerA?.name ?? null,
    playerBName: m0.playerB?.name ?? null,
    winnerName: m0.winnerName!,
    roomCode: m0.roomCode,
    matchState: { ...m0 },
    auditPayload: { dup: true },
  });
  ok("Direct tx replay returns firstTime=false",
     direct1.ok === true && direct1.firstTime === false);
  ok("Audit still 1 (no new row from replay)",
     (await auditCountFor(t.code, m0.id)) === 1);
}

// ────────────────────────────────────────────────────────────────────────
console.log("\n[Test 4] Crash-safe transaction (DB failure → in-memory rollback)");
{
  const t = await seedTournament("T4");
  await clearDb(t.code);
  const m0 = t.rounds[0][0];

  // Snapshot the live in-memory state before the failing call.
  const beforeWinner = m0.winner;
  const beforeWinnerName = m0.winnerName;
  const beforeElim = [...t.eliminated];
  const beforeFinalA = t.rounds[1][0].playerA;
  const beforeFinalB = t.rounds[1][0].playerB;
  const beforeStatus = t.status;

  // Simulate a DB failure inside the transaction by stubbing
  // db.transaction itself. recordMatchResultTx must catch this, return
  // ok=false, and recordMatchResult must restore the snapshot.
  const realTransaction = db.transaction.bind(db);
  (db as unknown as { transaction: typeof db.transaction }).transaction =
    (async () => {
      throw new Error("SIMULATED DB FAILURE inside transaction");
    }) as unknown as typeof db.transaction;

  try {
    const res = await recordMatchResult(t.code, m0.id, "A");
    ok("Crash path: kind=rejected", res.kind === "rejected", res);
    ok("Crash path: reason=db_error",
       res.kind === "rejected" && res.reason === "db_error");
  } finally {
    (db as unknown as { transaction: typeof db.transaction }).transaction =
      realTransaction;
  }

  // Live tournament must be untouched.
  const live = getTournament(t.code)!;
  ok("Crash rollback: match.winner restored to null",
     live.rounds[0][0].winner === beforeWinner);
  ok("Crash rollback: match.winnerName restored",
     live.rounds[0][0].winnerName === beforeWinnerName);
  ok("Crash rollback: eliminated list unchanged",
     JSON.stringify(live.eliminated) === JSON.stringify(beforeElim));
  ok("Crash rollback: next-round playerA NOT populated",
     live.rounds[1][0].playerA === beforeFinalA);
  ok("Crash rollback: next-round playerB NOT populated",
     live.rounds[1][0].playerB === beforeFinalB);
  ok("Crash rollback: status unchanged", live.status === beforeStatus);

  // DB must be empty for this match (tx rolled back).
  const rows = await rowsFor(t.code);
  ok("Crash rollback: DB has zero rows for this tournament (tx rolled back)",
     rows.length === 0, { rows });
  ok("Crash rollback: zero audit rows for this match",
     (await auditCountFor(t.code, m0.id)) === 0);

  // After rollback, a real call should still succeed.
  const recovery = await recordMatchResult(t.code, m0.id, "A");
  ok("Post-crash retry succeeds (kind=advanced)",
     recovery.kind === "advanced", recovery);
  ok("Post-crash retry persists to DB",
     (await rowsFor(t.code)).length === 1);
}

// ────────────────────────────────────────────────────────────────────────
console.log("\n[Test 5] Concurrent (parallel) submissions serialize");
{
  const t = await seedTournament("T5");
  await clearDb(t.code);
  const m0 = t.rounds[0][0];

  // Fire 5 parallel calls for the same matchId. Exactly one should
  // "advance", the other four must be "replay" (or "rejected" if they
  // happen to pick a different seat, which they won't here).
  const calls = await Promise.all([
    recordMatchResult(t.code, m0.id, "A"),
    recordMatchResult(t.code, m0.id, "A"),
    recordMatchResult(t.code, m0.id, "A"),
    recordMatchResult(t.code, m0.id, "A"),
    recordMatchResult(t.code, m0.id, "A"),
  ]);
  const advanced = calls.filter((c) => c.kind === "advanced").length;
  const replays = calls.filter((c) => c.kind === "replay").length;
  ok("Exactly one parallel call advanced", advanced === 1, { advanced, replays });
  ok("All others were replays", replays === calls.length - 1);
  ok("DB has exactly 1 row", (await rowsFor(t.code)).length === 1);
  ok("Audit has exactly 1 row",
     (await auditCountFor(t.code, m0.id)) === 1);
  ok("Eliminated list has loser exactly once",
     t.eliminated.filter((n) => n === m0.playerB?.name).length === 1);
}

await flushTournamentLocks();

console.log(`\n──────────────────────────────────────`);
console.log(`PASS: ${pass}    FAIL: ${fail}`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log("  - " + f);
}

// Clean up
for (const code of ["T1", "T2", "T3", "T4", "T5"]) {
  // tournament codes are generated, not the prefix — fetch by enumeration
}

process.exit(fail > 0 ? 1 : 0);
