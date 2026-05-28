# Checkpoint: pre-june-1-critical-bugfixes

**Date:** May 27, 2026
**Anchor commit:** `e937b502fd43b454f8d46d14bccf2182f0261083` (king-table-june-1-stable)
**Purpose:** Pre-fix rollback target before applying 7 targeted June 1 stability bug fixes.

## Rollback

If the bug-fix patch destabilizes anything before June 1:

1. Replit Project History → restore the commit that adds this file (it is the LAST commit before any bug-fix changes).
2. Or hard-reset to `e937b50` (this checkpoint's anchor) for a slightly cleaner rollback.

Both recovery paths take ~30 seconds and require no DB migrations.

## Scope of subsequent patch

Bugs being fixed (frontend + minimal server changes only — NO engine, scoring, bidding, dealing, room-assignment, or DB schema changes):

1. Disconnect/Reconnect screen Back button → restores active context instead of dumping to lobby
2. Pregame lobby idempotent rejoin → refresh reclaims slot, not duplicate/blocked
3. Mobile bid button hidden under cards → z-index/spacing fix
4. Tournament invite link routing → always lands on tournament lobby
5. Next-round Join button broken → ensure roomCode present, retry on fail
6. Host transferred to match winner → re-affirm host-token-only gating
7. Bracket score display → "Shaw def. Grace 253–188" under each completed match
