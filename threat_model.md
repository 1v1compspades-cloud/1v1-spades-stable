# Threat Model

## Project Overview

Spades Multiplayer is a publicly reachable 1v1 Spades web app with a React/Vite frontend and a Node.js Express + Socket.io backend. The production system has no traditional user account system or database-backed player profiles; trust is anchored on ephemeral room codes, per-seat reconnect tokens, and per-tournament host/player tokens. Core game state and tournament state are kept primarily in memory, with some persistence support for reconnect and audit flows.

Production entry points are the Express API under `/api`, the Socket.io endpoint at `/socket.io`, and the frontend artifact served at `/`. The mockup sandbox is development-only and should be ignored unless production reachability is proven.

## Assets

- **Live game secrecy** — each player's hand must remain hidden from opponents and spectators until cards are legally played.
- **Seat ownership and tournament identity** — reconnect tokens and tournament host/player tokens control who may reclaim a seat, receive match assignments, or perform host-only tournament actions.
- **Tournament integrity** — bracket state, match assignments, and host admin actions determine who advances and must not be mutable by unauthorized users.
- **Service availability** — rooms, tournaments, and socket connections are stored in memory, so unbounded public state creation can directly threaten uptime.
- **Operational secrets** — environment secrets such as `SESSION_SECRET` protect admin-only endpoints and must not leak through logs, URLs, or client code.

## Trust Boundaries

- **Browser to API / Socket.io server** — all client input is untrusted. The server must validate room actions, tournament actions, and reconnect claims.
- **Player to spectator boundary** — spectators may watch public room state but must never receive hidden hands or player-only secrets.
- **Unauthenticated public user to seat owner / host boundary** — possession of a room code alone must not grant player-seat reclaim or tournament-host powers.
- **Server to persistence layer** — reconnect token validation and room persistence support trust decisions; failures must not silently fail open.
- **Production vs dev-only artifacts** — `artifacts/mockup-sandbox/**` is out of production scope unless deployment routing shows otherwise.

## Scan Anchors

- Production backend entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/**`, `artifacts/api-server/src/game/socket.ts`
- Highest-risk code areas: `artifacts/api-server/src/game/socket.ts`, `artifacts/api-server/src/game/engine.ts`, `artifacts/api-server/src/game/tournament.ts`, `artifacts/api-server/src/game/persistence.ts`
- Public surfaces: `/api/rooms`, `/api/healthz`, `/socket.io` events for room, spectator, queue, and tournament flows
- Protected surfaces: `/api/admin/stats` and `admin_*` tournament socket events
- Dev-only areas to usually ignore: `artifacts/mockup-sandbox/**`

## Threat Categories

### Spoofing

This project relies on ephemeral identity rather than user accounts. Player-seat reconnects and tournament participation must be anchored to server-issued tokens, not display names or stale socket bindings. Tournament host actions must require the host token, and token-validation failures must fail closed rather than degrade to name-based trust.

### Tampering

Clients can request bids, plays, room joins, tournament joins, and bracket-affecting admin actions, but the server is authoritative for all game rules and bracket state. All move legality, room ownership semantics, and tournament advancement decisions must be enforced server-side. Client-provided names, room codes, and match identifiers must not let users mutate unrelated rooms or matches.

### Information Disclosure

The backend stores full private game state, including both hands and internal socket metadata, but clients should only receive role-appropriate sanitized views. Opponent hands, host/player tokens, and operational secrets must never be exposed in public responses, logs, or broadcasts. Admin-only operational data should require explicit secret-backed authorization.

### Denial of Service

Because the service is public and room/tournament state is maintained in memory, unauthenticated creation of rooms, tournaments, spectators, or long-lived socket state can directly consume RAM and broadcast capacity. The production system must enforce quotas that are meaningful across sockets and connections, not only per socket ID, and expensive or long-lived state must have bounded creation and retention behavior.

### Elevation of Privilege

Unauthorized users must not be able to reclaim a player seat, receive another participant's tournament assignment, or perform host-only actions such as pausing matches, remaking rooms, marking winners, or replacing players. Reconnect and host-admin flows are the main privilege boundaries and must not be bypassable via stale socket IDs, replayed names, or alternate entry paths like fresh joins.