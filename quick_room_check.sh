#!/usr/bin/env bash
set -u

check_room() {
  label="$1"
  code="$2"
  expected="$3"
  url="https://1v1euchre.com/api/debug/rooms/${code}/settings"

  echo
  echo "================================"
  echo "$label"
  echo "Room: $code"
  echo "Expected: $expected"
  echo "================================"

  json="$(curl -fsS "$url" 2>/dev/null || true)"

  if [ -z "$json" ]; then
    echo "FAIL: no response from $url"
    return 1
  fi

  echo "$json"

  echo "$json" | python3 -c '
import json, sys
expected = int(sys.argv[1])
data = json.load(sys.stdin)

race_to = data.get("raceTo")
if race_to is None:
    race_to = data.get("matchSettings", {}).get("raceTo")
if race_to is None:
    race_to = data.get("gameStateTargetScore")
if race_to is None:
    race_to = data.get("gameState", {}).get("targetScore")

target = data.get("gameStateTargetScore")
if target is None:
    target = data.get("gameState", {}).get("targetScore")
if target is Nonif target is Nonif target is Nonif tad rif target is Nonif target is Nongamif target is Noni:",if rget)if target is _tif target iteif target ntif target is No if target is Nonif target is Nonif target is Nonif tad rif tatarget) !=if target is Nonif target is Nonif targergif target is Narif target is Nonif ecif target is Nonif targ
printprintprintprintprintprintprintprintprin-point live room" "VASM7" "5"
check_room "10-point live room" "DLQ7N" "10"
check_room "Tournament 5-point room" "3UPAVM" "5"
