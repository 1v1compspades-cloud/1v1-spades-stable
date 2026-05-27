/**
 * Phase 6 — Host admin tools unit tests.
 *
 * Covers the tournament-level building blocks the admin socket events
 * are built on:
 *   - requireTournamentHost is token-only (rejects no-token, wrong-token,
 *     wrong-name even when the socketId matches the host's current sid).
 *   - appendAdminAudit ring-buffers and never exceeds the cap.
 *   - findMatchById / detachMatchRoom behave correctly.
 *   - recordMatchResult is idempotent on replay of the same winner and
 *     rejects on conflict (different winner) — the safety net that
 *     admin_mark_winner relies on.
 *
 * Runs against the DEV DB (recordMatchResultTx writes there).
 *
 * Run with:
 *   node --experimental-strip-types artifacts/api-server/src/game/__tests__/admin.test.mts
 */
import {
  createTournament,
  joinTournament,
  startTournament,
  recordMatchResult,
  getTournament,
  requireTournamentHost,
  appendAdminAudit,
  getAdminAuditLog,
  findMatchById,
  detachMatchRoom,
  flushTournamentLocks,
  type Tournament,
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

async function seed(prefix: string): Promise<{ t: Tournament; hostToken: string }> {
  const { tournament, hostToken } = createTournament(
    `${prefix}_host`,
    `sock-${prefix}-host`,
    { name: `${prefix} Admin`, size: 4, matchTarget: 250 },
  );
  joinTournament(tournament.code, `${prefix}_p2`, `sock-${prefix}-2`);
  joinTournament(tournament.code, `${prefix}_p3`, `sock-${prefix}-3`);
  joinTournament(tournament.code, `${prefix}_p4`, `sock-${prefix}-4`);
  startTournament(tournament.code, `sock-${prefix}-host`);
  const t = getTournament(tournament.code)!;
  // Stamp roomCodes on round-1 matches so recordMatchResult can write audit.
  for (const m of t.rounds[0]) {
    m.roomCode = `R-${prefix}-${m.position}`;
  }
  return { t, hostToken };
}

async function testRequireHost() {
  console.log("\n── requireTournamentHost (token-only) ──");
  const { t, hostToken } = await seed("auth");

  let threw = false;
  try { requireTournamentHost(t, undefined); } catch { threw = true; }
  ok("rejects missing token", threw);

  threw = false;
  try { requireTournamentHost(t, "definitely-not-the-token"); } catch { threw = true; }
  ok("rejects wrong token", threw);

  // Even another player's valid token must NOT pass — they aren't the host.
  const p2 = t.players.find((p) => p.name.endsWith("_p2"))!;
  threw = false;
  try { requireTournamentHost(t, p2.token); } catch { threw = true; }
  ok("rejects another player's valid token", threw);

  const hp = requireTournamentHost(t, hostToken);
  ok("accepts host's token and returns host record", hp.name === "auth_host");
}

async function testAuditBuffer() {
  console.log("\n── appendAdminAudit / getAdminAuditLog ──");
  const { t, hostToken } = await seed("audit");
  const host = requireTournamentHost(t, hostToken);

  appendAdminAudit(t, { action: "pause_match", actorName: host.name, matchId: "m1" });
  appendAdminAudit(t, { action: "resume_match", actorName: host.name, matchId: "m1" });
  const tail = getAdminAuditLog(t, 10);
  ok("audit entries appended", tail.length === 2);
  ok("most-recent-first ordering", tail[0].action === "resume_match");
  ok("entries carry actor name", tail.every((e) => e.actorName === host.name));
  ok("ts is set", tail.every((e) => typeof e.ts === "number" && e.ts > 0));

  // Stress the ring buffer cap — should never exceed 500.
  for (let i = 0; i < 600; i++) {
    appendAdminAudit(t, { action: "reset_timer", actorName: host.name });
  }
  ok("ring buffer capped at 500", t.adminAuditLog.length === 500);
}

async function testMatchLookup() {
  console.log("\n── findMatchById / detachMatchRoom ──");
  const { t } = await seed("lookup");
  const first = t.rounds[0][0];
  const found = findMatchById(t, first.id);
  ok("findMatchById returns the match", found?.id === first.id);
  ok("findMatchById returns null for unknown", findMatchById(t, "nope") === null);

  const oldRoom = detachMatchRoom(t, first.id);
  ok("detachMatchRoom returns the old room code", oldRoom === `R-lookup-${first.position}`);
  ok("detachMatchRoom clears match.roomCode", first.roomCode === null);
}

async function testMarkWinnerIdempotency() {
  console.log("\n── recordMatchResult idempotency (admin_mark_winner safety net) ──");
  const { t } = await seed("idem");
  const m = t.rounds[0][0];

  const first = await recordMatchResult(t.code, m.id, "A", { roomCodeForAudit: m.roomCode });
  ok("first mark advances bracket", first.kind === "advanced");

  const replay = await recordMatchResult(t.code, m.id, "A", { roomCodeForAudit: m.roomCode });
  ok("replay of SAME winner returns 'replay' (idempotent)", replay.kind === "replay");

  const conflict = await recordMatchResult(t.code, m.id, "B", { roomCodeForAudit: m.roomCode });
  ok("conflict on DIFFERENT winner is rejected", conflict.kind === "rejected");
}

async function main() {
  console.log("Phase 6 — Host admin tools tests\n");
  try {
    await testRequireHost();
    await testAuditBuffer();
    await testMatchLookup();
    await testMarkWinnerIdempotency();
  } catch (err) {
    console.error("Unhandled error in admin tests:", err);
    fail++;
  } finally {
    await flushTournamentLocks().catch(() => {});
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length > 0) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

void main();
