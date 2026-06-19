# v1.1 Scaffold Notes

Branch: `v1.1-match-accounts-leaderboards`

This branch is for planning and inert scaffolding while v1.0 remains in App
Review. Do not deploy this branch and do not apply database migrations until
the v1.1 data model is reviewed.

## Feature Flags

Server flags:

- `V11_ACCOUNTS_ENABLED`
- `V11_USERNAMES_ENABLED`
- `V11_LEADERBOARDS_ENABLED`
- `V11_MATCHMAKING_ENABLED`
- `V11_TOURNAMENTS_ENABLED`

Web flags:

- `VITE_V11_ACCOUNTS_ENABLED`
- `VITE_V11_USERNAMES_ENABLED`
- `VITE_V11_LEADERBOARDS_ENABLED`
- `VITE_V11_MATCHMAKING_ENABLED`
- `VITE_V11_TOURNAMENTS_ENABLED`

All flags are disabled by default. Guest play remains the default experience.

## Planned Scaffold Areas

- Account and username tables should be defined before any migration is run.
  Placeholder definitions now live in `lib/db/src/schema/v11-accounts.ts`;
  do not run Drizzle push/migrations until the model is reviewed.
- Matchmaking queue storage should stay separate from room gameplay and create
  ordinary existing rooms after a match is found.
- Leaderboard aggregate storage may be useful later, while the first read path should use
  `match_results`.
- Durable tournament header/roster/admin audit tables should be added while the
  current tournament runtime remains in-memory.
- Future `/api/v1.1/*` routes must expose disabled/placeholder contracts until
  their server flags are explicitly enabled.
- Future `/account`, `/find-match`, and `/leaderboards` web pages must be hidden
  behind Vite flags and should not be linked from the lobby until approved.

## Protected Areas

Do not modify these without an explicit gameplay task:

- card engine rules
- bidding/play handlers
- submitted mobile build config
- App Store freeplay gameplay screens
- existing reconnect/token behavior

## Next Safe Steps

1. Review account deletion and privacy requirements before enabling accounts.
   Initial scaffold recorded in `artifacts/api-server/src/lib/v11-account-privacy.ts`.
   Accounts must not be enabled until in-app account deletion and associated
   personal-data deletion/anonymization are designed.
2. Decide whether historical `match_results` usernames are guest aliases or
   claimable identities. Current safe default: historical names remain guest
   aliases and cannot be claimed/merged into accounts until a reviewed policy is
   approved.
3. Implement read-only leaderboard aggregation from `match_results`.
4. Implement Quick Match as a queue that creates ordinary existing rooms.
5. Persist tournament headers/rosters before restoring tournament state on boot.

## Account / Privacy Guardrails

- Guest play remains default until `V11_ACCOUNTS_ENABLED` is explicitly enabled.
- If account creation is enabled, a clear in-app account deletion path must ship
  at the same time.
- Account deletion must delete or anonymize associated server-side personal
  data, including profile identity and claimed username records.
- Support email and Terms/Privacy/Fair Play/Support pages must remain visible
  before and after account features are enabled.
- Pre-account `match_results` display names are guest aliases, not authenticated
  identities, until a separate claim/merge policy is reviewed.
- `v11_accounts` and `v11_usernames` are placeholder schema definitions only.
  They are not live data model approval and do not enable account creation.
