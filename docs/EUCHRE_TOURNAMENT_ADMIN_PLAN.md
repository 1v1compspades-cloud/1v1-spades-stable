# Euchre Tournament Admin Plan

## Goal

Allow Mehdi or another host to create and manage a free-play 1v1 Euchre tournament using a private admin key.

Players should join through public links or codes. Admin capabilities should stay hidden unless the host has verified the admin key.

## Tournament Creation Flow

1. Host creates a tournament.
2. System generates a public tournament code.
3. System generates a private admin key.
4. Host receives the admin key through a host-only confirmation view.
5. Host shares only the public join link or tournament code with players.
6. Players join the lobby.
7. Host starts bracket creation when ready.

## Public Player Join Flow

Players can join using:

- Public join link
- Tournament code

The public join link must not include the admin key.

Players should be able to:

- Enter display name
- Join lobby
- View assigned match when bracket starts
- Open their match room
- Report or confirm match completion later, depending on Phase 1 design

Players should not be able to:

- See admin key
- Start bracket
- Reset lobby
- Forfeit another player
- Mark winners unless the match workflow explicitly allows a player confirmation flow
- Access host tools by editing the URL

## Admin Key Rules

The admin key is private.

Requirements:

- Admin key must never be shown to players.
- Admin key must not pass to random players.
- Admin key must not be included in public join links.
- Admin key must not be stored in client-visible tournament state.
- Admin tools must remain hidden unless the key is verified.
- Admin actions must be checked server-side later.

## Host Controls

After admin key verification, host can:

- Start bracket
- Reset lobby
- Mark winner only if needed
- Forfeit disconnected player
- Copy match links
- View tournament setup details

Host controls should be recovery tools, not normal gameplay replacements.

## Bracket Creation

The bracket should be created from joined players.

Phase 1 should decide:

- Minimum player count
- Maximum player count
- Handling of odd player counts
- Whether byes are supported
- Whether seeding is manual, random, or join-order based

Initial recommendation: random seeding with byes if needed.

## Match Links

Each bracket match should have a match room link.

Match links should identify:

- Tournament
- Round
- Match
- Player seat or player token later

Match links should not expose:

- Admin key
- Opponent private hand
- Hidden match state
- Server secrets

## Match Completion

Normal completion should happen when a match reaches the target score.

Manual host intervention should exist for exceptions:

- Disconnected player
- Incorrect result report
- Stalled match
- Player dispute in free-play context

Admin winner marking should be auditable later, with a timestamp and reason.

## Spectator-Safe Future Structure

The data model should eventually separate:

- Public bracket state
- Player-specific private hand state
- Admin-only controls
- Spectator-safe match summaries

Spectators should never receive private hands or hidden decision state.

## Security Notes For Phase 1

Use server-side verification for admin actions.

Treat the admin key like a secret bearer credential. Do not trust UI hiding alone.

Prefer short-lived admin sessions after key verification, backed by server-side checks.
