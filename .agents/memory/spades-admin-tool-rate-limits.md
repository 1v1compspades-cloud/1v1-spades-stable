---
name: Admin-only tool rate limits are loop guards, not trust boundaries
description: Sizing the per-socket rate cap on admin-only socket tools (e.g. fast_finish_match) and why too-tight caps break legitimate operation + e2e tests
---

# Admin-only tool rate limits

Once a socket event is gated to the **admin** (secret-key-unlocked `adminSockets`)
only, its `checkRate(...)` cap stops being a security boundary — the admin is
already fully trusted (holds mark_winner / force_forfeit / remake). The cap is
then only a **runaway-loop guard**.

**Rule:** size such caps to comfortably cover the heaviest *legitimate* burst, not
to throttle. For `fast_finish_match` the heaviest case is a host driving a full
32-player tournament (max **31 matches**), so the cap is `60/60s`, not `20/60s`.

**Why:** the live-socket tournament e2e funnels **all** match-ends through the
single admin socket. With a 20/60s cap it tripped "Slow down" on ~11 matches and
the bracket never completed; adding client-side retry/backoff made the run ~3 min,
which the sandbox kills before it writes its report. Bumping the server cap to 60
let the e2e finish in ~75s with a plain direct emit (no retry needed).

**How to apply:** when you move a tool from a public/dev path to admin-only, also
re-evaluate its rate cap — a cap that made sense against untrusted callers is now
just friction. And `checkRate` here is a *sliding* window that does NOT penalize a
blocked attempt (it returns false without pushing a timestamp), so old entries
always age out — retry eventually succeeds, but raising the cap is the cleaner fix.

Related: removing an env-based auth bypass (`NODE_ENV !== "production"` /
`import.meta.env.DEV`) must be done on **both** server (`requireFastFinishAuth`)
and client (`canFastFinish`) — a server-only fix still leaks the control's
visibility to non-admins in preview.
