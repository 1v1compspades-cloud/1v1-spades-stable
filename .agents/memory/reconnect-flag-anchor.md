---
name: Anchor reconnect gating on persisted state, not a DB lookup
description: For session-recovery flows that issue a per-seat secret, decide "does this seat require a token?" from a persisted in-memory flag — never from a runtime DB existence check.
---

When a reconnect path can fall back to a weaker check (name-match, IP, etc.), the
decision of which path to take MUST come from data that travels with the room's
authoritative state — not from a live DB query.

**Why:** A runtime `selectExists()` style check has to choose a behaviour on DB
error: fail-open hides outages from users but silently downgrades every tokenized
seat to the fallback path (in our case, name-match on a `null` seat = trivial
hijack by anyone with the room code). Fail-closed locks out legitimate users
during transient DB blips. Neither is right. The correct anchor is a boolean
stamped onto the persisted GameState the moment the token row is written, so:

- DB-down during reconnect → seat is still known to be tokenized → reject with
  a retry-able error, never fall back.
- DB-down during initial issuance → flag stays false → that room legitimately
  has no token on file, fallback is honest, not a security regression.
- After server restart → the flag rehydrates from the persisted state with the
  rest of the room, so the gate is identical pre- and post-boot.

**How to apply:**
- Add a `tokenizedSeats: [bool, bool]` (or analogous) field to the GameState.
- Set it ONLY after both `issueToken` AND the follow-up `commit` succeed.
- Re-commit immediately so the flag survives a crash between issuance and the
  next gameplay event.
- In the reconnect handler, branch on `state.tokenizedSeats[seat]`, not on any
  `hasTokenRecord(seat)` DB probe. Treat `validateToken` returning `db_error`
  as a reject-with-retry, never as a fallback trigger.
- Never log the incoming token value (`data.token`) on reconnect failures — a
  log scrape would otherwise turn into a bearer-secret leak.
