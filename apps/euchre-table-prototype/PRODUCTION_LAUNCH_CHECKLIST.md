# Production Launch Checklist

## Domain

- Open `https://1v1euchre.com`.
- Confirm HTTPS loads without a certificate warning.
- Open `https://1v1euchre.com/healthz`.
- Confirm the health response is ok.
- Confirm the homepage loads from the root domain.
- Confirm CSS and JavaScript assets load.

## Play-A-Friend

- Create a room.
- Join the room from another browser/device.
- Choose trump.
- Play a hand.
- Confirm refresh keeps the correct player seat.
- Open the room without a player seat and confirm spectator view is read-only.
- Confirm spectators cannot see hidden hands.

## Tournament

- Create a tournament.
- Save the private host key.
- Confirm the private host key is not shown to players.
- Join 4 players.
- Start the bracket with the private host key.
- Verify match links are available.
- Open match links.
- Report results.
- Confirm winners advance.
- Confirm the champion screen appears.

## Safety And Mobile

- Confirm only the approved launch disclaimer appears: 1v1 Euchre is free-play only. There are no cash games, wagers, buy-ins, deposits, payouts, or paid prize pools.
- Confirm mobile layout works.
- Confirm there is no horizontal overflow.
- Confirm browser console has no errors during the smoke test.
