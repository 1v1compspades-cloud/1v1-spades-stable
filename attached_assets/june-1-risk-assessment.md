# June 1 Tournament — Software Risk Assessment

**Project:** 1v1 Competitive Spades — multiplayer web app
**Locked build:** `1db9fd6859fbcc3e5c0116cda16e230cde57113c` (alias `june-1-stable`)
**Assessment date:** May 27, 2026 (T-5 days)
**Scope:** Software-only. Excludes human/network/Replit-infra risk.

---

## Headline

**~92% chance the event runs without a software incident the host cannot recover from.**

"Recover from" means: host has a documented tool or fallback that resolves the issue in under ~60 seconds without losing the tournament.

---

## Risk breakdown

| Failure mode | Odds it happens | Reasoning |
|---|---|---|
| **Core gameplay bug** (wrong winner, bad deal, wrong score) | ~1% | 84 rules tests cover the engine end-to-end. Server-authoritative, deterministic. Stable for weeks. |
| **Bracket advance bug** (double-advance, wrong opponent paired) | ~2% | Transactional + idempotent (`recordMatchResultTx` returns `"replay"` for same winner, `"rejected"` for conflict). Race fixes shipped in Phase 6. Only realistic trigger is a Postgres hiccup, which rolls back cleanly. |
| **Reconnect fails for a specific player** | ~10% | Biggest remaining risk. Token model is solid in tests, but real reconnects depend on browser localStorage + network reconnection + Replit's mTLS proxy not flapping. Mitigation: host **Remake Room** in ~30s. |
| **Server restart loses a tournament mid-event** | ~3% | Would need a Replit infra glitch or someone fat-fingering a deploy. Mitigated by build lock + "no deploys" rule. Fallback: manual mode (host tracks bracket on paper, spins up Quick Match rooms per pairing). |
| **Admin tool itself misbehaves** | ~2% | Lowest-confidence area because admin paths have least real-world mileage. 16 tests cover the primitives but not every UI flow. Worst case: action no-ops and host retries (idempotent). |
| **Mobile player can't play their match** | ~5% | No device pass since last layout changes. Most likely "bid button half off-screen on old iPhone SE" type issue. Workaround: that player joins from desktop. |
| **Unknown-unknowns** | ~5% | Things I genuinely didn't anticipate. This is what the rollback + manual-mode fallback exists for. |

These don't sum directly to 8% — they overlap and some are conditional on others. The 92% headline accounts for that.

---

## Confidence drivers (the 92%)

- 163/163 tests passing, covering the actually-risky paths: bracket math, idempotency, token gating, sanitization.
- All race conditions found during Phase 6 hardening are fixed and documented in agent memory so they don't reappear.
- Every named failure mode has a host-tool recovery path measured in seconds, not minutes.
- Build is locked. No surprise changes can sneak in.
- Anti-cheat is verified at the sanitizer level — basically cannot leak hands without rewriting the WebSocket emit chain.

## Risk drivers (the 8%)

- System has never been load-tested with 32 real humans on 32 real networks simultaneously. Tests don't catch "what happens when 8 people refresh at the same moment."
- Reconnect logic is the most complex part of the codebase and has the most state interactions.
- **One unmitigated structural risk:** no tournament persistence. A server restart at the wrong moment forces manual bracket recovery.
- Mobile UI not physically verified on a phone since the last layout changes.

---

## Highest-leverage thing to do before event

A real 4-player dry run with humans (or 4 incognito tabs across two devices) on the deployed `.replit.app` URL — **not localhost**. This is the only test that catches real-network reconnect behavior through the Replit proxy.

Doing it takes the estimate from ~92% to ~96%. Cost: ~30 minutes.

---

## Recovery playbook (recap)

| Symptom | Recovery action | Time |
|---|---|---|
| Player stuck on turn timer | Host Dashboard → Reset Timer | ~5s |
| Match frozen, both players unresponsive | Pause → talk → Resume | ~30s |
| Player can't reconnect | Remake Room (both players get fresh match_assigned) | ~30s |
| Player disappeared (rage-quit / disconnect won't recover) | Force Forfeit absent seat | ~10s |
| Bracket out of sync | Mark Winner (idempotent — safe to retry) | ~10s |
| Reconnect broken for a match | Remake Room + manually restore score by re-bidding totals | ~2min |
| Tournament mode itself broken | Manual mode: Quick Match per pairing, host tracks bracket on paper | ongoing |
| Stream view broken | Share Tournament page instead | ~10s |
| App broken | Restore checkpoint `1db9fd6` | ~30s |
| Catastrophic | Roll to `b96b218` (loses only Replace feature, all admin tools intact) | ~30s |

---

## Bottom line

I would take this build to a real tournament without losing sleep, with the Host Dashboard pinned in a tab the whole time. The 8% residual risk is dominated by reconnect edge cases that the host can recover from with a single click.

**Verdict: 🟢 GO for June 1.**
