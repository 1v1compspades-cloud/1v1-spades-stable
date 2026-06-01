---
name: Spades socket autoConnect:false — every entry page must call connect()
description: Why a new page that uses the shared socket hangs unless it triggers connect() on mount.
---

# Shared socket is autoConnect:false

The single shared socket.io client (useSocket provider) is created with `autoConnect: false` and retries forever once connected. Nothing connects it automatically — each **entry page** must call the exposed `connect()` in a mount effect (`useEffect(() => { connect(); }, [connect])`). Lobby and Tournament already do this.

**Symptom when forgotten:** a page that gates its data fetch on the `connected` flag (e.g. the host dashboard's `refresh()` guard `if (!token || !connected) return`) will sit forever on a loading screen with no error, but ONLY when the page is loaded directly / via refresh / via bookmark. Navigating to it client-side from a page that already connected masks the bug — that's why it survives casual testing and bites during a live event when someone refreshes.

**Rule:** any new route/page that reads socket data MUST call `connect()` on mount. `connect()` is idempotent (`if (socket && !socket.connected)`), so calling it every render is harmless.

**Why:** the bug is invisible in the common navigation path and only appears on direct load — exactly the recovery path a host uses mid-tournament.

**Also:** loading screens gated on `connected` should distinguish "Connecting…" (`!connected`) from "Loading…" (connected, fetch in flight) from an error, so a stuck connection is legible instead of looking like a hang.
