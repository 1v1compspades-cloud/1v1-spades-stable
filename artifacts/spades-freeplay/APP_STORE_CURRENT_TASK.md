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
| iOS build | 23 |
| Bundle ID | com.oneononespades.freeplay |
| EAS build ID | pending |
| EAS submission ID | pending |
| App Store Connect app ID | 6776721716 |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6776721716/testflight/ios |
| Release mode default | Manual release after approval |

## Manual launch checklist

- [ ] Apple processing complete for build 23
- [ ] Build 23 added to internal TestFlight testing
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

1. Build and submit iOS build 23 with EAS when ready.
2. Wait for Apple processing to finish for build 23.
3. Add build 23 to internal TestFlight testing.
4. Smoke test on a real iPhone: launch, create room, join from second device or browser, play bidding/trick flow, background/reopen reconnect, leave/return, and open Privacy/Terms/Support.
5. Confirm the hosted web mobile layout fix is live on `https://1v1spades.com`.
6. Upload App Store screenshots.
7. Complete App Privacy, metadata, and App Review notes.
8. Mark ready, then submit the App Store version for review.
9. Track App Review status: Waiting for Review, In Review, Rejected, or Approved.
10. If approved, manually release by default.
11. Verify the public App Store listing, install path, live URLs, and first-launch flow.

## Current blockers

- [ ] Smoke test visual layout failure seen on build 21: iPhone bidding/game screen clipped horizontally, score counters overflowed past the right edge, bid modal was too wide/tall for the viewport, bottom hand was partially cut off, and the Report Bug button truncated. Build 23 includes the latest mobile layout fixes; do not mark smoke test complete until build 23 is built, submitted, processed, installed, and verified on device.
- [ ] Smoke test visual layout failure seen on hosted build 22 candidate: room code/header was truncated on the iPhone-width layout. The local web fix now shows a dedicated full room-code strip and wrap-safe lobby code; deploy to `1v1spades.com` and verify before App Review.
- [ ] Smoke test visual clarity failure seen on mobile lobby: opponent join/ready state was not prominent enough. The local web fix now shows a top lobby presence card with "Opponent joined" and both players' ready states; deploy and verify before App Review.
- [ ] Smoke test play-card blocker seen on mobile website: after bidding, the play-card step was unclear and the user could not reliably tell whether it was their turn or which cards were legal. The local web fix now keeps a persistent hand-area turn hint and strongly highlights legal cards; deploy and verify before App Review.

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
- Build 23 remains the release candidate unless smoke testing finds a blocker.
- If Apple rejects the app, record the reason here before changing build or
  metadata.
- Do not commit Apple credentials or local EAS settings.
- Keep `.config/eas-cli-nodejs/user-settings.json` untracked.
