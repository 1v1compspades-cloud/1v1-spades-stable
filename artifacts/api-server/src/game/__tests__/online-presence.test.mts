/**
 * v1.1 Online Indicator MVP tests.
 *
 * Run:
 *   node --experimental-strip-types artifacts/api-server/src/game/__tests__/online-presence.test.mts
 */
import { OnlinePresenceTracker } from "../onlinePresence.ts";

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

console.log("\n— Online Indicator presence tracker —");

const tracker = new OnlinePresenceTracker();

ok("starts empty", tracker.snapshot().onlineCount === 0, tracker.snapshot());

const one = tracker.connect("socket-a");
ok("online count increments on first connect", one.onlineCount === 1, one);

const duplicate = tracker.connect("socket-a");
ok("duplicate connect is idempotent", duplicate.onlineCount === 1, duplicate);

const two = tracker.connect("socket-b");
ok("online count increments on second socket", two.onlineCount === 2, two);

const finding = tracker.setFindingMatchCount(1);
ok("finding match count can be set", finding.findingMatchCount === 1, finding);

const afterOneDisconnect = tracker.disconnect("socket-a");
ok("online count decrements on disconnect", afterOneDisconnect.onlineCount === 1, afterOneDisconnect);
ok("finding match count is preserved across ordinary disconnect", afterOneDisconnect.findingMatchCount === 1, afterOneDisconnect);

const cleared = tracker.setFindingMatchCount(0);
ok("finding match count clears", cleared.findingMatchCount === 0, cleared);

const afterUnknownDisconnect = tracker.disconnect("missing-socket");
ok("unknown disconnect is idempotent", afterUnknownDisconnect.onlineCount === 1, afterUnknownDisconnect);

const empty = tracker.disconnect("socket-b");
ok("online count reaches zero", empty.onlineCount === 0, empty);

console.log("");
console.log(`  Online presence: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("  Failures:");
  for (const failure of failures) console.log(`    - ${failure}`);
}
process.exit(fail === 0 ? 0 : 1);
