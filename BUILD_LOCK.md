# BUILD LOCK — king-table-june-1-stable

**Status:** 🔒 LOCKED for the King of the Table test stream (May 28, 2026) and the June 1, 2026 1v1 Competitive Spades tournament.

| Field | Value |
|---|---|
| Lock name | `king-table-june-1-stable` |
| Locked commit | `e937b502fd43b454f8d46d14bccf2182f0261083` |
| Lock date | May 27, 2026 |
| KotT test stream | May 28, 2026 |
| Tournament date | June 1, 2026 |
| Lifted on | (fill in after the event) |

## Why this lock

Stable production build for King of the Table test stream and June 1 1v1 Competitive Spades tournament. Server logs show 0% crash/drop rate; no core logic changes should be made after this checkpoint without a new stability test.

The previous lock pointed at `1db9fd6` but production had already moved past it with three cosmetic shuffle-animation commits. This lock re-anchors at the actual deployed code so the rollback target and the live build match.

## Lock rules

1. **No deploys** between this checkpoint and the end of the June 1 tournament window.
2. **No code changes** to gameplay, tournament advancement, scoring, bidding, dealing, room assignment, or database logic — unless something breaks badly during the event.
3. **One restart window allowed:** restart the API server once, ~30 minutes before player arrival, after a fresh smoke test. No restarts during play unless emergency rollback.
4. **Emergency rollback target:** restore checkpoint `e937b50` via the Replit Project History UI. Recovery time ~30s, no migrations.
5. **Deeper rollback target:** `f6ad2ba` (previous published build) — last pre-lock published commit. Loses only the cosmetic shuffle-animation fixes; all gameplay, tournament, KotT, and admin logic identical.

## Pre-event day-of checklist

- [ ] Confirm current HEAD is still `e937b50` (or the same code as it).
- [ ] Restart `artifacts/api-server: API Server` workflow once, 30 min before players arrive.
- [ ] Run a 4-player test tournament with 2 friends + 2 incognito tabs on the live URL.
- [ ] Confirm Host Dashboard loads at `/tournament/<CODE>/host`.
- [ ] Open Host Dashboard in a pinned tab — keep it open the whole event.
- [ ] Have the bracket on paper as a backup.
- [ ] Have the rollback steps printed/bookmarked.

## Test baseline at lock time (May 27, 2026)

- Typecheck: ✅ clean (4 packages)
- Rules engine + tournament tests: ✅ 49/49 passing
- Live server probe: `/api/healthz` → 200 on apex, www, and Replit dev domain
- Production crash rate (last ~2.6h of deployment logs): **0%** (zero uncaughtException / unhandledRejection / FATAL; one clean SIGTERM = previous deploy)

## Emergency contacts (fill in)

- Host operator: ___________
- Backup operator: ___________
- Rollback authorizer: ___________

---

When the event is over, delete this file or change `Status` to `🔓 UNLOCKED` to lift the freeze.
