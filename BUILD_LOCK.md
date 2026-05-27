# BUILD LOCK — june-1-stable

**Status:** 🔒 LOCKED for the June 1, 2026 tournament window.

| Field | Value |
|---|---|
| Lock name | `june-1-stable` |
| Locked commit | `1db9fd6859fbcc3e5c0116cda16e230cde57113c` |
| Lock date | May 27, 2026 |
| Tournament date | June 1, 2026 |
| Lifted on | (fill in after the event) |

## Lock rules

1. **No deploys** between now and the end of the June 1 tournament window.
2. **No code changes** unless something breaks badly during the event.
3. **One restart window allowed:** restart the API server once, ~30 minutes before player arrival, after a fresh smoke test. No restarts during play unless emergency rollback.
4. **Emergency rollback target:** restore checkpoint `1db9fd6` via the Replit Project History UI. Recovery time ~30s, no migrations.
5. **Deeper rollback target:** `b96b218` (pre-replacement) — last code-changing commit before the lock. Loses only the pre-start replacement feature; all admin tools remain.

## Pre-event day-of checklist

- [ ] Confirm current HEAD is still `1db9fd6` (or the same code as it).
- [ ] Restart `artifacts/api-server: API Server` workflow once, 30 min before players arrive.
- [ ] Run a 4-player test tournament with 2 friends + 2 incognito tabs on the live URL.
- [ ] Confirm Host Dashboard loads at `/tournament/<CODE>/host`.
- [ ] Open Host Dashboard in a pinned tab — keep it open the whole event.
- [ ] Have the bracket on paper as a backup.
- [ ] Have the rollback steps printed/bookmarked.

## Test baseline at lock time

- Typecheck: ✅ clean (4 packages)
- Rules engine: ✅ 84/84
- Tournament bracket transactions: ✅ 45/45
- Admin tools: ✅ 16/16
- Pre-start replacement: ✅ 18/18
- **Total: 163/163**
- Live server probe: `/api/healthz` → 200 (7ms), `/` → 200 (8ms)

## Emergency contacts (fill in)

- Host operator: ___________
- Backup operator: ___________
- Rollback authorizer: ___________

---

When the event is over, delete this file or change `Status` to `🔓 UNLOCKED` to lift the freeze.
