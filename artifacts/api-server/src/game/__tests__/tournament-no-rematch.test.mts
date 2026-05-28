import { strict as assert } from "node:assert";
import {
  createTournament,
  joinTournament,
  startTournament,
  getTournament,
} from "../tournament.js";

let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

console.log("── tournament rematch guard (regression for SF1 ghost-game) ──");

test("4-player bracket: SF1 and SF2 rooms exist and carry tournamentRef-able matchIds", () => {
  const { tournament: t0, hostToken } = createTournament("Alice", "sock_a", {
    name: "Test1",
    size: 4,
  });
  joinTournament(t0.code, "Bob", "sock_b");
  joinTournament(t0.code, "Carol", "sock_c");
  joinTournament(t0.code, "Dave", "sock_d");
  startTournament(t0.code, "sock_a", hostToken);

  const t = getTournament(t0.code);
  assert.ok(t, "tournament exists after start");
  assert.equal(t.rounds[0].length, 2, "4-player bracket has 2 semifinals");
  assert.equal(t.rounds[1].length, 1, "4-player bracket has 1 final");

  for (const m of t.rounds[0]) {
    assert.ok(m.id, `Match has an id (used in tournamentRef)`);
    assert.ok(m.playerA && m.playerB, `Round 1 match ${m.id} has both players seeded`);
  }
  assert.equal(t.rounds[1][0].roomCode, null, "Finals room is NOT pre-created (lazy)");
  assert.equal(t.rounds[1][0].playerA, null, "Finals slot A starts empty (filled lazily)");
  assert.equal(t.rounds[1][0].playerB, null, "Finals slot B starts empty (filled lazily)");
});

test("4-player bracket: SF1 players and SF2 players are disjoint (no duplicate seeding)", () => {
  const { tournament: t0, hostToken } = createTournament("Alice", "sock_a", {
    name: "Test2",
    size: 4,
  });
  joinTournament(t0.code, "Bob", "sock_b");
  joinTournament(t0.code, "Carol", "sock_c");
  joinTournament(t0.code, "Dave", "sock_d");
  startTournament(t0.code, "sock_a", hostToken);
  const t = getTournament(t0.code);
  assert.ok(t);

  const sf1Players = [t.rounds[0][0].playerA, t.rounds[0][0].playerB];
  const sf2Players = [t.rounds[0][1].playerA, t.rounds[0][1].playerB];
  const overlap = sf1Players.filter((p) => sf2Players.includes(p));
  assert.equal(overlap.length, 0, "No player appears in both SF1 and SF2");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
