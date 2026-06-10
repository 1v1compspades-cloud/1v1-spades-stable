#!/usr/bin/env bash
set -u

OUT="spadescomp_milestone_report_$(date +%Y%m%d_%H%M%S).txt"

LIVE_BASE="${LIVE_BASE:-https://1v1euchre.com}"
ROOM5="${ROOM5:-}"
ROOM10="${ROOM10:-}"
TOURNEY_ROOM5="${TOURNEY_ROOM5:-}"
RUN_TESTS="${RUN_TESTS:-1}"

PASS=0
FAIL=0
WARN=0
SKIP=0

say() {
  printf "%s\n" "$*" | tee -a "$OUT"
}

section() {
  say ""
  say "============================================================"
  say "$1"
  say "============================================================"
}

pass() {
  PASS=$((PASS + 1))
  say "✅ PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  say "❌ FAIL: $1"
}

warn() {
  WARN=$((WARN + 1))
  say "⚠️  WARN: $1"
}

skip() {
  SKIP=$((SKIP + 1))
  say "➖ SKIP: $1"
}

run_and_log() {
  say ""
  say "$ $*"
  "$@" >> "$OUT" 2>&1
  return $?
}

check_file_exists() {
  local file="$1"
  local label="$2"

  if [ -f "$file" ]; then
    pass "$label exists: $file"
  else
    fail "$label missing: $file"
  fi
}

check_grep_pass() {
  loca  loca  loca  loca  loca  loca  loca  loca 


 loca  loca  locamatches=$(git grep -niE "$pattern" -- "$@" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    pass "$label"
    say "$matches"
  else
    fail "$label"
  fi
}

check_grep_fail() {
  local label="$1"
  local pattern="$2"
  shift 2

  local matches
  matches=$(git grep -niE "$pattern" -- "$@" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    fail "$label"
    say "$matches"
  else
    pass "$label"
  fi
}

check_live_room() {
  local label="$1"
  local room_code="$2"
  local expected="$3"

  if [ -z "$room_code" ]; then
    skip "$label: no room code provided"
    retu n
  fi

  local url="${LIVE_BASE%/}/api/debug/rooms/${room_code}/settings"
  say ""
  say "Checking $label"
  say "$url"

  local json
  json=$(curl -fsS --max-time 20 "$url" 2>> "$OUT")

  if [ $? -ne 0 ] || [ -z "$json" ]; then
    fail "$label    fail "$label    failor returned nothing"
    return
  fi

  s  s  s  s  s  s  s  s  ="$json" EXPECTED="$expected" node - <<'NODE' >> "$OUT" 2>&1
const data = JSON.parse(process.env.JSON_DATA);
const expected = Number(process.env.EXPECTED);

const raceTo = Number(
  data.raceTo ??
  data.matchSettings?.  data.matchSettigameState  data.matchSet  d  d.gameState?.targetScore
))))))))))))))))))eTargetScore = Number(
  data.gameStateTargetScore ??
  data.gameState?.targetScore ??
  data.matchSettings?.raceTo ?  data.matchSettings?.raceT.l  data.matchSetto:", raceTo);
console.log("Parsed gameStateTargetScore:", gameStateTargetScore);

if (raceTo !== expected) {
  throw new Error(`raceTo was ${raceTo}, expected ${expected}`);
}

if (gameStateTargetScore !== expected) {
  throw ne  throw ne  throw ne  throw ne  throw ne  throw netScore}, expected  throected}`);
}

const forbiddeconst forbiN.stringify(dataconst forbiddeconst forbiN.stringify(dataconst for
  "admin_key",
  "seattoken",
  "seat_token",
  "privatetoken",
  "private_token",
  "hiddenhands",
  "hidden_hands"
];

ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffw Erroffffffffffffffffffffffffffffffffffffffffffffffeld: ${term}`);
  }
}

console.log("Live room prooconsole.log("Live rooifconsole.log("Lithen
    pass "$label: live debug endpoint proves raceTo ${expected}"
  else
    fail "$label: live debug endpoint did not prove raceTo ${expected}"
  fi
}

section "Ssection "Ssection "Ssection "S "Rsection "Ssection "Ssection "Ssection "S "Rsection "Ssection "Ssection "Ssection "S " "ROOM10: ${ROOM10:-not provided}"
say "TOURNEY_ROOM5: ${TOURNEY_ROOM5:-not provided}"

section "REsection "REsection "REsection "REsection "REsection "REsectionGit resection "REsection "REsection "REsecti a section "REsection "REsection "REsection "REsection "REsection "REsectionGit resection "RE"$OUT"

say ""
say "Latest commit:"
git log -1 --oneline >> "$OUT" 2>&1 && pass "Latest Git commitgit log -1 -- warn "Could not git log -1 -Git git log -1 --on
say "Git status:"
GIT_STATUS="$(git status --short 2>/dev/null || true)"
say "$GIT_STATUS"

if [ -z "$GIT_STATUS" ]; then
  pass "Working tree clean"
else
  warn "Working tree has uncommitted changes"
fi

check_file_check_file_check_file_check_file_check_file_check_file_check_file_che"
check_file_exists "packages/euchre-core/package.json" "Euchre core package"
check_file_exists "apps/euchre-table-prototype/src/room-state.js" "Room state source"
check_file_exists "apps/euchre-table-prototype/src/room-client.js" "Room client source"
check_file_exists "apps/euchre-table-prototype/src/styles.css" "Styles source"

section "TEST SUITE"

if [ "$RUN_TESTS" = "1" ]; then
  if run_and_log npm --prefix apps/euchre-table-prototype test; then
    pass "Euchre table prototype tests pass"
  else
    fail "Euchre table prototype tests failed"
  fi

  if run_and_log npm --prefix packages/euchre-core test  if run_and_log npm --prefix packages/euchre-core test  if run_and_log npm --prefix packages/euchre-core test  if run_anse RUN_TESTS=$RUN_TES  if run_and_log npm --prefix packages/euchre-corcat > .spadescomp_runtime_milestone_check.mjs <<'NODE'
import assert from "node:assert/simpor";
import fs from "node:fs";

import {
  createRoom,
  sanitizeRoomForViewer
} from "./apps/euchre-table-prototype/src/room-sta} from "./apps/euchre-table-proner
} from "./packages/euchre-core/src/index.} from "./packages/euchre-core/src/index.} from "./packages/euchre-core/src/index.} is} from "./packages/euchre-core/src/index.} from "./packages/euchre-core/src/index.} frassert.equal(room5.matchSettings.raceTo, 5, "createRoom did not store raceTo 5");
assert.equal(room5.gameState.mode.targetScore, 5, "gameState.mode.targetScore is not 5");

const publicView5 = sanitizeRoomForViewer(room5, "host-token");

assert.equal(publicView5.matchSettings.raceTo, 5, "public room view does not expose raceTo 5");
assert.equal(publicView5.gameState.targetScore, 5, "public gameState.targetScore is not 5");

assert.equal(
  getMatchWinner({ player1: 5, player2: 0 }, publicView5.gameState.targetScore),
  "player1",
  "core winner logic does not declare winner at 5"
);

assert.equal(
  getMatchWinner({ player1: 4, player2: 0 }, publicView5.gameState.targetS  getMa  null,
  "core winner logic declares wi  "core winner logic declares wi  "core winner logic declares wi  "core winner logien: "host-token",
  displayName: "Host",
  matchSettings: {
    raceTo: 10,
    stickTheDealer: true
  }
});

assert.equal(room10.matchSettings.raceTo, 10, "createRoom did not store raceTo 10");
assert.equal(room10.gameState.mode.targetScore, 10, "gameState.mode.targetScore is not 10");

const laconst laconst laconst laconst laconst laconst laconst laconst laconst laconst lacone: "Host",
  matchSettings: {
    raceTo: "5 pts",
    stickTheDealer: tr    stickTheDealer: tr    stickTheDealer: tr    stickTheDealer: tr    stickTheDealer: tr    st

const roomStateSource = fs.readFileSync("./apps/euchre-table-prototype/src/room-state.js", "utf8");

assert.match(
  roomStateSource,
  /getMatchWinner\(score,\s*targetScoreForRoom\(room\)\  /ge "playCa  /getMatchWinner\(score,\s*targetScoScoreForRoom(room)  /getMatert.doesNotMatch(
  roomStateSource,
  /getMatchWinner\(score,\s*10\)/,
  "Hardcoded getMatchWinner(score, 10) found"
);

assert.doesNotMatch(
  roomStateSource,
  /score\s*>=\s*10/,
  "Hardcoded score >= 10 found in room-state.js"
);

console.log("Runtime Race To prooconsole.log("Ronsole.log("- createRoom raceTo 5 passed");
console.log("- public room view raceTo 5 passed");
console.log("- gameState targetScore 5 passed");
console.log("- core winner at 5 passed");
console.log("- no winner at 4console.log("- no winner at 4console.log("- no winner at 4console.log("- no winner at 4console.log(".log("- playCardForRoconsole.log("tScoreForRoom(room)");
NODE

if node .spadescomp_runtime_milestone_check.mjs >> "$OUT" 2>&1; then
  pass "Local runtime proof confirms Race To 5 and winner target logic"
else
  fail "Local runtime proof failed. Race To pipeline is not fully   fail "Local r -f .spadescomp_runtime_milestone_check.mjs

section "LIVE DEBUG ENDPOINT PROOF"

check_live_room "Fresh live 5-point room" "$ROOM5" 5
check_live_room "Fresh live 10-point room" "$ROOM10" 10
check_live_room "check_live_room "check_live_room "check" "$TOURNEY_ROOM5" 5

section "ROOM SCREEN / DISPLAY SOURCE CHECK"

check_grep_pass \
  "Room client renders Race To from roo  "Room client renders Race To from roo  "Room client renders Race To from roo  "Room clie-  "Room client renders Race To from roo  "Room clai  "Room client renders Race To from roo  "Room play textContent/innerHTML = 10" \
  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "t "Upcard  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "t,\  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "textCo  "texeck_grep_pass \
  "Upcard has black styling" \
  "\.upcard\.black|\.upcard[^{]*\.black|\.card\.black,\s*\.upcard\.black" \
  "apps/euchre-table-prototype/src/styles.css"


 "apps/euchre-table-prototype/src/styles.css"
.b red suits" \
  "hearts|diamonds|isRed|cardColorClass" \
  "apps/euchre-table-prototype/src/room-client.js" \
  "apps/euchre-table-prototype/src/app.js"

check_grep_pass \
  "Upcard/kitty UI exists" \
                                                                                                                                                                                                                                                                      pp                                                                                                                                                                                                                                                                      pp                                                                                         s/euchre-table-prototype/src/room                                                                          p_pass \
  "Coin flip phase/interface still exists" \
  "coin_flip|coinFlip|coin flip|coin-modal|coin-card" \
  "apps/euchre-table-prototype/src/room-client.js" \
  "apps/euchre-table-prototype/src/room-state.js" \
  "apps/euchre-table-prototype/src/styles.css"

section "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAYER PROOFsection "TOURNAMENT / 64-PLAournaments.html" -- apps/euchre-table-prototype 2>/dev/null || true)"

if [ -n "$HISTORY_MATCHES" ]; then
  pass "Tournament history source/page references found"
  say "$HISTORY_MATCHES"
else
  fail "Tournament history source/page references not found"
fi

HISTORY_LIVE_OK=0
for path in history.html tournaments.html tournament-history.html; do
  url="${LIVE_BASE%/}/$path"
  body="$(curl -fsS --max-time 12 "$url" 2>/dev/null || true)"
  if printf "%s" "$body" | grep -qiE "Tournament History|Past Tournaments|Champion|Winner|Completed"; then
    pass "Live tournament history page appears available: /$path"
    HISTORY_LIVE_OK=1
    break
  fi
done

if [ "$HISTORY_LIVE_OK" -eq 0 ]; then
  warn "No live tournament history page detected at common paths"
fi

section "BRANDING / TESTFLIGHT SAFETY CHECKS"

BAD_BRANDING="$(git grep -niE 'solo[_ -]?spades|spades[_ -]?(app|game|lobby|table|repo|repository|project|test app)|spadescomp|SPADES_|/spades|Spades App|Spades Game|Spades Lobby' -- '*.js' '*.html' '*.css' '*.json' ':(exclude)**/tests/**' 2>/dev/null || true)"

if [ -n "$BAD_BRANDING" ]; then
  fail "Bad Spades/Spadescomp branding found in app code"
  say "$BAD_BRANDING"
else
  pass "No bad Spades/Spadescomp branding found in app code"
fi

RESTRICTED_WORDING="$(git grRESTRICTED_WORDIg|RESTRICTED_WORDING="$(git grRESTRICTED_WORDIg|RESTRICTED_WORDING="$(|real money|deposit|withdraw' -- apps/euchre-table-prototype '*.html' '*.js' '*.css' '*.json' ':(exclude)**/tests/**' 2>/dev/null || true)"

if [ -n "$RESTRICTED_WORDING" ]; then
  fail "Restricted commerce/gambling wording found"
  say "$RESTRICTED_WORDING"
else
  pass "No restricted commerce/gambling wording found in app code"
fi

SECRET_FILES=SECRET_FILES=SECRET_FILES=SECRET_FILES=SECRET_FILES=SECRET_FILame "*secret*" -o -iname "*private*" \) -print 2>/dev/null | grep -v node_modules || true)"

if [ -n "$SECRET_FILES" ]; then
  warn "Potential secret/private files found. Make sure these are not committed."
  say "$SECRET_FILES"
else
  pass "No obvious .env/secret/private files found within maxdepth 4"
fi

section "LIVE BUILD HEADER CHECK"

HEADER_OUTPUT="$(curl -fsSI --max-time 15 "${LIVE_BASE%/}/room.html?v=milestone-check-$(date +%s)" 2>/dev/null || true)"
say "$HEADER_OUTPUT"

if printf "%s" "$HEADER_OUTPUT" | grep -qi "X-1v1Euchre-Build"; then
  pass "Live site exposes X-1v1Euchre-Build header"
elif printf "%s" "$HEADER_OUTPUT" | grep -qi "X-Spadescomp-Build"; then
  fail "Live site still exposes old X-Spadescomp-Build header"
else
  warn "No build header found on live response"
fi

section "FINAL SUMMARY"

say "✅ Pass: $PASS"
say "❌ Fail: $FAIL"
say "⚠️  Warn: $WARN"
say "➖ Skip: $SKIP"

if [ "$FAIL" -eq 0 ]; then
  say ""
  say "GREEN LIGHT RESULT: No hard failures detected."
  say "Still manually confirm actual gameplay ends at 5 and mobile UI looks clean."
else
  say ""
  say "NOT GREEN YET: Fix the failed items above before TestFlight prep."
fi

say ""
say "Report saved to:"
say "$OUT"
