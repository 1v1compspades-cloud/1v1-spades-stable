# Deployment Notes

## Local Run

From `apps/euchre-table-prototype`:

```bash
npm start
```

The server defaults to port `5174` and redirects root traffic to the Euchre home page. To choose another port:

```bash
PORT=5174 npm start
```

## Recommended Host

Recommended target: **Render Web Service**.

Why Render is the easiest safe option for this current app:

- The app is a long-running Node HTTP server, not a static-only site.
- Render supports Node services with `PORT` supplied by the platform.
- Render supports custom domains, HTTPS, deploy logs, and health checks without changing the app shape.
- The in-memory room/tournament state stays alive for the active service process.

Other options:

- Railway is also compatible and similarly simple for Node services.
- Fly.io is compatible, but setup is more operationally involved.
- Replit Deployments can work for a quick launch if the repo is already there.
- Vercel is not the best fit right now because this app uses a long-running in-memory Node server rather than a serverless/static architecture.

## Production Start

Recommended production command:

```bash
NODE_ENV=production npm start
```

Package script:

```bash
npm run start:production
```

## Test Commands

Run the website and room/tournament tests:

```bash
npm test
```

Run the shared Euchre rules engine tests:

```bash
cd ../../packages/euchre-core
npm test
```

## Build And Start

There is no separate build step yet. This prototype is served by `server.js` with static HTML/CSS/JS and in-memory room/tournament state.

Deployment start command:

```bash
npm start
```

## Environment

Optional:

- `PORT`: HTTP port for the Node server. Defaults to `5174`.
- `NODE_ENV`: Set to `production` on the deployed host.

No other environment variables are required for the Phase 9 deployment prep.

## Entrypoint

- Server entrypoint: `apps/euchre-table-prototype/server.js`
- Public home page: `/apps/euchre-table-prototype/home.html`
- Static app folder: `apps/euchre-table-prototype`
- Health check: `/healthz`

## Repository And Domain

- GitHub repo: `1v1-euchre-freeplay`
- Target domain: `1v1euchre.com`

## 1v1euchre.com Launch Notes

- Point the host process at `apps/euchre-table-prototype/server.js`.
- Configure the platform to run `npm start` from `apps/euchre-table-prototype`.
- Set `PORT` only if the hosting provider requires a specific value.
- Confirm root `/` redirects to the home page.
- Confirm `/healthz` returns `{ "ok": true, "app": "1v1-euchre-freeplay" }`.
- Confirm room and tournament state remain in memory for the active server session.
- Use the tester checklist before sharing the site broadly.

## Suggested Hosting Options

- Render Web Service running `npm start` from `apps/euchre-table-prototype`. This is the recommended Phase 10 target.
- Railway service with `PORT` supplied by the platform.
- Fly.io Node service pointed at `server.js`.
- A small VPS with Node 20+ and a reverse proxy terminating TLS.

## DNS Notes

At the domain registrar for `1v1euchre.com`:

- Open DNS management for the domain.
- Add the custom-domain records provided by the hosting platform.
- For the apex domain, this may be an A record, ALIAS, ANAME, or CNAME-flattened record depending on the registrar.
- For `www.1v1euchre.com`, add a CNAME to the provider target if a `www` address is desired.
- Remove conflicting placeholder records for the same hostnames before saving.
- Wait for DNS propagation.

After DNS propagates:

- Open `https://1v1euchre.com`.
- Open `https://1v1euchre.com/healthz`.
- Confirm the browser shows HTTPS without a certificate warning.
- Confirm the host dashboard marks the custom domain as verified.
- Confirm root `/` redirects to the home page.
- Confirm static CSS and JavaScript assets load.
- Run the production launch checklist.

## Rollback Note

Keep the previous known-good commit or deployment available. If launch checks fail, roll back to that deployment, then re-run the post-deploy checklist before sending testers back in.

## Post-Deploy Test Checklist

- Open `https://1v1euchre.com`.
- Confirm the home page loads.
- Confirm `/healthz` returns ok.
- Create a room.
- Join the room from a second browser or device.
- Play a hand.
- Create a 4-player tournament.
- Start the bracket with the private host key.
- Open match links.
- Report winners.
- Confirm the champion appears.
- Confirm a spectator cannot see hidden hands.
- Confirm the mobile layout has no horizontal overflow.
- Confirm only the approved free-play disclaimer appears.

## Known Tester-Limit Scope

- Room and tournament data are in memory only.
- A server restart clears active rooms and tournaments.
- Quick Match is still a placeholder.
- Admin keys are shown once to the creator and then must be re-entered by the host.
