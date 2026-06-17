---
name: Spades old-tab guard must gate reconnect effects, not just the UI
description: A "superseded tab" overlay alone does not stop the stale tab from reclaiming the seat — auto-reconnect/subscribe effects keep running.
---

A blocking overlay that visually "pauses" a stale browser tab is NOT enough to honor a
"prefer the newest tab" guarantee.

**Why:** React `useEffect` reconnect/join/subscribe effects keep firing on the hidden
(superseded) tab. During any transient socket disconnect, the stale tab silently
re-issues `reconnect`/`joinRoom`/`subscribe_tournament` and reclaims the seat/host
socket from the newer tab — the server always rebinds to the most-recent socket. So the
overlay shows on the wrong tab and cross-tab state churn returns.

**How to apply:** When adding a tab-guard (`useTabGuard` → `superseded`), gate EVERY
auto-reattach effect with `if (tabSuperseded) return;` AND add `tabSuperseded` to that
effect's dep array — do not rely on the early-return overlay alone. In this app that
means the Room.tsx reconnect/join effect and the Tournament.tsx subscribe effect.
`reclaim()` (the overlay's "Use this tab instead") flips the flag back so the effects
re-run and this tab takes over intentionally.
