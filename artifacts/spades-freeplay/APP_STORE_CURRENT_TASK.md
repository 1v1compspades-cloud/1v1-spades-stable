# Spades Free Play - Current App Store Launch Task

This file is the tracked launch task for the current App Store/TestFlight run
through release approval. Codex guides the steps, runs checks, and updates
checkboxes only after a user confirms the matching App Store Connect action.
Use `pnpm run appstore:status` from this package, or
`corepack pnpm --filter @workspace/spades-freeplay run appstore:status` from the
workspace root, to print the automated dashboard.

## Current build

| Field | Value |
| --- | --- |
| App | Spades Free Play |
| Version | 1.0.0 |
| iOS build | 21 |
| Bundle ID | com.oneononespades.freeplay |
| EAS build ID | cb3da640-16d5-44c7-813f-908f00485a4e |
| EAS submission ID | dde15017-24a9-4995-a793-b73a48861885 |
| App Store Connect app ID | 6776721716 |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6776721716/testflight/ios |
| Release mode default | Manual release after approval |

## Manual launch checklist

- [x] Apple processing complete for build 21
- [ ] Build 21 added to internal TestFlight testing
- [ ] TestFlight smoke test checklist complete
- [ ] Hosted web mobile layout fix deployed to 1v1spades.com
- [ ] App Store screenshots uploaded
- [ ] App Privacy questionnaire complete
- [ ] App Store metadata complete
- [ ] App Review notes added
- [ ] Ready to submit for App Review
- [ ] Submitted for App Review
- [ ] App Review approved
- [ ] App manually released
- [ ] Post-release verification complete

## Ordered next actions

1. Add build 21 to internal TestFlight testing.
2. Smoke test on a real iPhone: launch, create room, join from second device or browser, play bidding/trick flow, background/reopen reconnect, leave/return, and open Privacy/Terms/Support.
3. Confirm the hosted web mobile layout fix is live on `https://1v1spades.com`.
4. Upload App Store screenshots.
5. Complete App Privacy, metadata, and App Review notes.
6. Mark ready, then submit the App Store version for review.
7. Track App Review status: Waiting for Review, In Review, Rejected, or Approved.
8. If approved, manually release by default.
9. Verify the public App Store listing, install path, live URLs, and first-launch flow.

## App Review notes draft

Spades Free Play is a free, head-to-head card game. No account, payment,
deposit, wagering, prize, or redeemable reward features are included. To test,
open the app, create a room, and join from another device or browser using the
room code. Privacy, Terms, and Support pages are available at 1v1spades.com.

## Guardrails

- Keep the release free play only: no accounts, no payments, no prizes, no
  gambling.
- Codex does not submit final App Review or release the app unless explicitly
  asked by the user at that step.
- Build 21 remains the release candidate unless smoke testing finds a blocker.
- If Apple rejects the app, record the reason here before changing build or
  metadata.
- Do not commit Apple credentials or local EAS settings.
- Keep `.config/eas-cli-nodejs/user-settings.json` untracked.
