/**
 * Pre-start replacement player — unit tests for the `replacePlayer`
 * tournament primitive that backs the `host_replace_player` socket event.
 *
 * Covers:
 *   - Replaces a non-host slot in place; preserves roster size and index.
 *   - Issues a new per-player token; old token is invalidated.
 *   - Rejects after the tournament starts.
 *   - Rejects replacing the host.
 *   - Rejects unknown old name.
 *   - Rejects duplicate new name (case-insensitive).
 *   - Trims/caps replacement name length.
 *
 * Run with: npx tsx artifacts/api-server/src/game/__tests__/replace-player.test.mts
 */
import {
  createTournament,
  joinTournament,
  startTournament,
  replacePlayer,
  getTournament,
} from "../tournament.js";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function ok(label: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.log(`  ✗ ${label}`, detail ?? ""); }
}

function seedLobby(prefix: string) {
  const { tournament, hostToken } = createTournament(
    `${prefix}_host`,
    `sock-${prefix}-h`,
    { name: `${prefix}`, size: 4, matchTarget: 250 },
  );
  joinTournament(tournament.code, `${prefix}_p2`, `sock-${prefix}-2`);
  joinTournament(tournament.code, `${prefix}_p3`, `sock-${prefix}-3`);
  joinTournament(tournament.code, `${prefix}_p4`, `sock-${prefix}-4`);
  return { t: getTournament(tournament.code)!, hostToken };
}

async function main() {
  // ── Happy path ────────────────────────────────────────────────────────
  console.log("• in-place replacement");
  {
    const { t } = seedLobby("R1");
    const beforeIdx = t.players.findIndex((p) => p.name === "R1_p3");
    const beforeToken = t.players[beforeIdx].token;
    const res = replacePlayer(t.code, "R1_p3", "Backup");
    ok("returns replacementName", res.replacementName === "Backup");
    ok("returns removedName", res.removedName === "R1_p3");
    ok("roster size preserved", t.players.length === 4);
    ok("slot kept its index", t.players[beforeIdx].name === "Backup");
    ok("new token issued (different)", res.newPlayerToken !== beforeToken);
    ok("token written to slot", t.players[beforeIdx].token === res.newPlayerToken);
    ok("socketId cleared", t.players[beforeIdx].socketId === "");
  }

  // ── Old token is invalidated ──────────────────────────────────────────
  console.log("• old token invalidated");
  {
    const { t } = seedLobby("R2");
    const oldToken = t.players.find((p) => p.name === "R2_p2")!.token;
    replacePlayer(t.code, "R2_p2", "NewP2");
    // Old token must no longer authenticate as that player.
    let threw = false;
    try {
      joinTournament(t.code, "R2_p2", "sock-new", oldToken);
    } catch { threw = true; }
    ok("old token + old name no longer reconnects", threw);
  }

  // ── Reject after start ────────────────────────────────────────────────
  console.log("• rejects after start");
  {
    const { t } = seedLobby("R3");
    startTournament(t.code, "sock-R3-h");
    let msg = "";
    try { replacePlayer(t.code, "R3_p2", "Late"); }
    catch (e) { msg = (e as Error).message; }
    ok("throws clear message after start", /already started|started/i.test(msg), msg);
  }

  // ── Reject replacing host ─────────────────────────────────────────────
  console.log("• rejects host slot");
  {
    const { t } = seedLobby("R4");
    let msg = "";
    try { replacePlayer(t.code, "R4_host", "NewHost"); }
    catch (e) { msg = (e as Error).message; }
    ok("throws 'Cannot replace the host'", /Cannot replace the host/.test(msg), msg);
  }

  // ── Reject unknown old name ───────────────────────────────────────────
  console.log("• rejects unknown player");
  {
    const { t } = seedLobby("R5");
    let msg = "";
    try { replacePlayer(t.code, "doesnotexist", "X"); }
    catch (e) { msg = (e as Error).message; }
    ok("throws 'Player not found'", /not found/i.test(msg), msg);
  }

  // ── Reject duplicate new name (case-insensitive) ──────────────────────
  console.log("• rejects duplicate name");
  {
    const { t } = seedLobby("R6");
    let msg = "";
    try { replacePlayer(t.code, "R6_p2", "r6_p3"); }
    catch (e) { msg = (e as Error).message; }
    ok("rejects collision with another slot", /already taken/i.test(msg), msg);
    // Cannot collide with the host either.
    let msg2 = "";
    try { replacePlayer(t.code, "R6_p2", "R6_host"); }
    catch (e) { msg2 = (e as Error).message; }
    ok("rejects collision with host name", /already taken/i.test(msg2), msg2);
    // Roster intact.
    ok("roster unchanged after rejection", t.players.length === 4);
    ok("p2 still p2", t.players.some((p) => p.name === "R6_p2"));
  }

  // ── Trim + cap ────────────────────────────────────────────────────────
  console.log("• trims + caps name");
  {
    const { t } = seedLobby("R7");
    const long = "x".repeat(40);
    const res = replacePlayer(t.code, "R7_p2", `   ${long}   `);
    ok("trims whitespace", !res.replacementName.startsWith(" "));
    ok("caps at 24 chars", res.replacementName.length === 24);
  }

  // ── Empty name rejected ───────────────────────────────────────────────
  console.log("• rejects empty replacement");
  {
    const { t } = seedLobby("R8");
    let msg = "";
    try { replacePlayer(t.code, "R8_p2", "   "); }
    catch (e) { msg = (e as Error).message; }
    ok("rejects whitespace-only name", /required/i.test(msg), msg);
  }

  console.log("");
  console.log(`Results: ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log("Failures:", failures);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
