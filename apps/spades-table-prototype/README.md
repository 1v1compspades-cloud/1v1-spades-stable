# 1V1 Competitive Spades Hosted App

Production beta web app for free-play 1v1 Spades at `https://1v1spades.com`.

## Current player screens

- Home: display name, create room, join room, spectator join, reconnect, Find Match, invite/copy helpers.
- Table: compact room/table status, opponent/status, public score/trick information, leave/rematch controls when relevant.
- Play: ready, bidding, playable hand, current/last trick, hand summary, match complete, rematch request.
- Spectator: joins full rooms or explicit spectator links with hidden hands protected.
- Reconnect: restores the current saved room/seat through local identity and server snapshot recovery.
- Report Bug: tester diagnostics panel with sanitized, copyable bug report data.

## Current support surfaces

- Quick Match: hosted server queue pairs two players into a sanitized room.
- Local account stats: local-only preview for wins/losses, match history, and leaderboard shape.
- Local tournament history: local-only snapshot preview for completed match grouping.
- Manual QA tools: developer-only local fixtures and visual QA scripts, hidden from normal testers.

## Not yet full production features

- Durable server-backed accounts and global leaderboards.
- Full tournament brackets, host/admin tools, and King of the Table queue mode.
- App Store account roles/admin authentication.
- Dedicated production settings, admin login, KOTT, and tournament screens.

These are intentionally separate release phases. Do not expose local preview panels as production rankings or tournament entry.

## Verification

```sh
npm test
npm run smoke:hosted -- https://1v1spades.com
```

Rules coverage lives in `packages/spades-core` and should stay the source of truth for deal, bidding, legal play, trick winner, bags, nil, and match completion.
