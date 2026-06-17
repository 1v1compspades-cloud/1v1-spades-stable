# Phase 8 — Final Pre-Lock Smoke Test Report

**Date:** May 27, 2026 — T-5 days to June 1
**Verdict:** 🟢 **GO for June 1**
**Locked build:** `1db9fd6859fbcc3e5c0116cda16e230cde57113c` (alias `june-1-stable`)

---

## 1. Build / version control

| Item | Value |
|---|---|
| Stable build commit | `1db9fd6859fbcc3e5c0116cda16e230cde57113c` |
| Branch | `main` (also pushed to `gitsafe-backup/main`) |
| Commit message | "Add pre-tournament readiness checklists for stability testing" |
| Last code-changing commit | `b96b218` — pre-start player replacement (Phase 7) |
| Typecheck | ✅ Clean across all 4 packages |
| Tests | ✅ 163/163 (84 rules + 16 admin + 45 tournament-tx + 18 replace-player) |
| Server boot | ✅ Clean — port 8080, rehydrated 6 rooms / 0 expired |
| HTTP route exposure | ✅ Only `/api/healthz`, `POST /api/rooms`, `GET /api/rooms/:roomCode`. GET returns only `{roomCode, status, playerCount, createdAt}` — no card data. No `/debug`, `/dev`, `/test`, or `/admin` HTTP routes. |

### Rollback instructions

- **Primary:** Replit Project History → restore checkpoint at commit `1db9fd6`. Recovery ~30s. No migrations.
- **Deeper:** restore `b96b218` (pre-replacement). Loses only the Replace feature; all admin tools intact.

## 2. Full tournament flow — 🟢 Green

All paths verified end-to-end via `tournament-tx.test.mts` (45) + `rules.test.mts` (84) + Phase 7 manual passes:
create tournament → token-based joins → bracket build (4/8/16/32) → start → R1 rooms spun up → match_assigned delivery → spectator join → bidding (coin-toss winner bids second R1, alternates after) → dealing → suit-follow + spades-broken enforced → scoring (bids/bags/nil/blind-nil/tier-based bag penalty) → match completes → advanceTournamentOnGameOver → transactional recordMatchResultTx → final ("Finals" label) → champion screen.

## 3. Disconnect / reconnect — 🟢 Green

Token-based identity model from `replit.md`.

| Refresh point | Behavior |
|---|---|
| Lobby refresh | Rejoins via token, retains slot ✓ |
| During bidding | Server resends game_state, current bidder unchanged ✓ |
| After deal | Hand restored from server-authoritative state ✓ |
| Mid-trick | Played cards + own hand restored ✓ |
| Spectator refresh | Re-attached as spectator (not as player) ✓ |
| Player ↔ spectator role | Seat resolver = `players.findIndex(p => p.socketId === socket.id)` ✓ |
| Tournament page refresh during live match | `pendingAssignment` re-emits `match_assigned` ✓ |

## 4. Admin intervention — 🟢 Green

All events token-gated through `requireTournamentHost`, audited via 500-entry ring + DB-backed `game_audit_log` for bracket advancements. Verified by `admin.test.mts` (16 tests).

| Action | Status |
|---|---|
| `admin_pause_match` | ✅ Sets isPaused, bid/play reject, turn timer no-ops |
| `admin_resume_match` | ✅ Clears flag, re-arms timer |
| `admin_reset_timer` | ✅ Re-arms current actor's timer |
| `admin_force_forfeit` | ✅ Routes through forfeitTournamentMatch, advances bracket |
| `admin_mark_winner` | ✅ Idempotent — replay = "replay", conflict = "rejected" |
| `admin_remake_room` | ✅ Wrapped in withRoomLock, detaches + fresh createMatchRoomAndAssign |
| Bracket consistency | ✅ Transactional advance + idempotency = no double-advance |
| Audit log | ✅ Every action writes AdminAuditEntry + broadcasts admin_audit_appended |

## 5. Anti-cheat — 🟢 Green

- **Player vs player isolation:** Each player only ever receives own hand. Opponent only gets `opponentHandSize`.
- **Spectator isolation:** `sanitizeStateForSpectator` (socket.ts:185) explicitly sets `hand: []`, `opponentHandSize: 0`, sends only `handSizes: [n0, n1]`. All 3 spectator emit sites route through it.
- **Round summary:** roundHistory contains bids + tricks + scoring, never card-by-card hands.
- **HTTP route:** `/api/rooms/:roomCode` returns 4 fields, none card-related.
- **Move validation:** Every place_bid / play_card checks `players.findIndex(socketId)` server-side.

## 6. Mobile — 🟡 Yellow

No code regressions since last full mobile pass. Tailwind responsive layout in Room.tsx unchanged.
**Action:** spend 2 minutes on iPhone before the event to confirm. No code change needed.

## 7. Stream — 🟢 Green

- Spectator route `/room/:code?spectator=1` works as OBS Browser Source via the deployed `.replit.app` domain.
- "Watch Live" link on every live bracket card.
- Sanitized view shows scores/bids/tricks/played cards/round history — everything an audience needs, nothing they shouldn't see.
- **Stream backup:** keep Tournament page (`/tournament/:code`) open in a second tab for emergency screen-share.

## 8. Known operational risks — 🟡 Yellow (acknowledged)

1. **No tournament persistence.** Server restart loses tournament state. Casual rooms (Quick Match / KotT) ARE rehydrated from `active_rooms` table; tournaments are NOT.
2. **No bye support.** Roster must be exactly 4, 8, 16, or 32. Invalid sizes snap to 4.
3. **Backups instead of byes.** Use pre-start replacement flow (host → Replace → copy join URL → send to backup). Lobby status only.
4. **No deploys during tournament window.**
5. **One restart allowed:** 30 min before players arrive, after smoke test. No restarts during play unless emergency.
6. **Rate limits:** create_tournament 3/60s, join_tournament 10/30s, host_replace_player 5/30s, create_room 5/30s, join_room 10/30s, place_bid 20/5s, play_card 30/5s.

## 9. Emergency fallback plan

| Symptom | Action |
|---|---|
| Player stuck on turn timer | Host Dashboard → Reset Timer |
| Match frozen | Pause → talk → Resume |
| Player can't reconnect | Remake Room (new match_assigned to both) |
| Player rage-quit / disappeared | Force Forfeit absent seat |
| Bracket out of sync | Mark Winner (idempotent, safe to retry) |
| Reconnect broken for a match | Remake Room + manually restore score by re-bidding totals |
| Tournament mode broken | Fall back to manual: create Quick Match per bracket pairing, host tracks bracket on paper |
| Stream view broken | Share Tournament page instead |
| App broken | Restore checkpoint `1db9fd6` (~30s) |
| Catastrophic | Roll to `b96b218` (loses only Replace feature) |

## 10. Final readiness ratings

| Area | Rating |
|---|---|
| Build / version control | 🟢 Green |
| Full tournament flow | 🟢 Green |
| Disconnect / reconnect | 🟢 Green |
| Admin intervention | 🟢 Green |
| Anti-cheat | 🟢 Green |
| Mobile | 🟡 Yellow (device confirm, no code action) |
| Stream | 🟢 Green |
| Operational risks | 🟡 Yellow (mitigated by playbook) |
| Emergency fallback | 🟢 Green |

**No Red items. No tournament blockers. No code changes required.**

---

## Mock tournament run — May 27, 2026

```
PRE-FLIGHT: typecheck                                         ✅ 4/4 packages clean
ROUND 1 — Rules engine                                        ✅ 84/84
ROUND 2 — Tournament bracket transactions                     ✅ 45/45
ROUND 3 — Admin tools                                         ✅ 16/16
ROUND 4 — Replacement player                                  ✅ 18/18
LIVE SERVER PROBE  /api/healthz → HTTP 200 (7ms)              ✅
LIVE SERVER PROBE  /             → HTTP 200 (8ms)             ✅
TOTAL                                                         163/163
```

---

# 🟢 GO for June 1.

Pre-event checklist:
1. Restart the API server once, 30 min before player arrival.
2. Run a 4-player test tournament on the live URL.
3. Open Host Dashboard in a pinned tab — keep it open the whole event.
4. Have the bracket on paper as a backup.
5. Have the rollback steps printed/bookmarked.
6. Do NOT deploy or push code between now and June 1.
