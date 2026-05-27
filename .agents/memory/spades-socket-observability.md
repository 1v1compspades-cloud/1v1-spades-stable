---
name: Spades socket observability
description: Where socket.data.playerName must be tagged so disconnect/error logs stay debuggable.
---

`socket.data.playerName` must be set on **every** entry path, not just `create_room`/`join_room`.

**Why:** Disconnect handler logs `socket.data.playerName` to identify who dropped. If only fresh-join handlers tag it, then any user who refreshed (reconnect_player), joined as spectator (join_as_spectator), or reconnected as spectator (reconnect_spectator) shows up as `undefined` in logs — exactly the cases where reconnect bugs are hardest to debug.

**How to apply:** Whenever you add a new socket handler that establishes a player/spectator identity for the socket, set `socket.data.playerName = name` and include `playerName` in the handler's success log line. Audit by grepping for handlers that call `socket.join(code)` — each one should also tag the name.
