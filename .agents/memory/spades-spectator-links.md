---
name: Spades spectator links (tournament)
description: How spectator entry works and what's actually missing when "restore spectator links" comes up
---

# Spades spectator links

The spectator JOIN mechanism is complete and server-authoritative: route `/room/<CODE>?spectator=1` → client calls `joinAsSpectator` → server adds to `spectators[]` and broadcasts `sanitizeStateForSpectator` (no hands). Links must NEVER carry tokens — spectating needs none.

## The non-obvious dead-end
A nameless external viewer (no stored `playerName`) who opens a `?spectator=1` link gets stuck on "Connecting…" forever: Room's join effect guards on `!playerName` and never fires. Fix is a UI-only name prompt in Room.tsx that runs `savePlayerName` (early-return placed AFTER all hooks). Don't "fix" this in sockets/server.

## Don't duplicate the bracket
BracketView already renders a per-live-match "👀 Watch Live" anchor (`<a target="_blank" href=/room/<code>?spectator=1>`, testid `watch-live-<id>`). It opens a NEW TAB and does NOT mutate localStorage — so a seated player can watch another match without self-demoting their own seat.

**When restoring spectator UI, the genuinely-missing pieces are usually:** Copy-Spectator-Link buttons, an empty-state ("Spectator links appear when matches begin."), and host-dashboard copy rows — NOT another Watch-Live button.

**Why:** A same-tab `setLocation` + `saveIsSpectator(true)` "watch" handler demotes the current user to spectator. Prefer the bracket's new-tab anchor pattern; let Room's own `?spectator=1` effect set spectator storage in the new tab. Also avoid reusing the `watch-live-<id>` testid (collides with BracketView).
