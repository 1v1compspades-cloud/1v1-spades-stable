# post-invite-fix-stable

Anchor checkpoint marker — invite link 404 bug fixed and shipped to production.

## State at this checkpoint

- **Git commit:** `e7cb6ad` (Published your App) — HEAD of main
- **Code fix commit:** `56dbf99` (Fix broken tournament invite links that lead to 404 errors)
- **Production bundle:** `/assets/index-CGOjGA65.js` on https://1v1spades.com
- **Date:** May 28, 2026 (pre-June-1 event)

## What was fixed

`Tournament.tsx` invite-link builder + replace-player join-URL builder no longer use `document.baseURI`. They now use `import.meta.env.BASE_URL`, eliminating the `/tournament/<CODE>/tournament/<CODE>` 404 bug that surfaced when the host clicked Copy while already on the tournament lobby page.

## Verification

- Pre-fix prod bundle (`CKM5OpAC`): 1 occurrence of `baseURI`, 0 of `BASE_URL` → buggy
- Post-fix prod bundle (`CGOjGA65`): 0 `baseURI`, 0 `BASE_URL` (inlined as `"/"`) → fixed

## Rollback ladder (newest → oldest)

| Commit | Description |
|---|---|
| `e7cb6ad` | **← post-invite-fix-stable (this anchor)** |
| `56dbf99` | invite-link 404 fix (code change) |
| `b61c078` | bid modal blur reduction |
| `ba69224` | tournament authenticated-flag fix |
| `5639594` | last published before this batch |
| `898ae18` | card / music fix |
| `e937b50` | king-table-june-1-stable (older anchor) |

## NOT touched in this batch

Gameplay, scoring, bidding rules, card/trick logic, sockets, tournament advancement, KotT state, admin tools, database schema. All deferred 7-bug items remain unaddressed and parked for post-event.
