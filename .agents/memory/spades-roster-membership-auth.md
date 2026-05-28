---
name: Spades client roster membership must trust server auth
description: Don't gate "am I in this lobby?" UI on a localStorage name compare — use the server-confirmed authenticated flag.
---

# Spades client roster membership must trust server auth

**Rule:** When deciding whether the local user is "in" a tournament/room roster, the client MUST gate on the server-confirmed `authenticated` flag returned by `subscribe_tournament` (or the equivalent room subscribe), in addition to any name/identity match. A pure name compare against localStorage is wrong.

**Why:** Player names are non-unique and localStorage names get recycled across games and shared devices. The first time this bit us, an invitee with a stale `playerName` matching an existing roster entry got `iAmInRoster=true` on the client, hiding the join form and producing the user-visible symptom "the invite link only works for one person." The server was correct the whole time — it returned `authenticated: false` for the unauthenticated session — but the client threw that signal away.

**How to apply:**
- Any `iAmInRoster` / `iAmInRoom` / `iAmSeated` derivation must combine `authenticated` (from subscribe response) with the identity match, never just identity alone.
- After a fresh `joinTournament` / `joinRoom` succeeds, set the local `authenticated` flag immediately — the server just issued the token, so we know we're in.
- On subscribe failure or disconnect, reset `authenticated` to false so the UI doesn't continue trusting a stale session.
- Same pattern applies to any future "am I the host" / "am I a seated player" derivations — never trust localStorage name compares as authorization, even for UI-only decisions.
