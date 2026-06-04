# Spades Free Play — Final TestFlight / App Store Submission Checklist

Submission-flow companion to `APP_STORE_CHECKLIST.md` (which holds the full asset
list). This file is the **go/no-go** checklist for the first TestFlight upload.

App is **free play only**: no tournaments in-app, no KOTT, no admin tools, no
cash, no paid entries, no deposits, no wallets, no prizes, no gambling.

Legend: ✅ ready · ⬜ action required (you) · 🚫 blocker

---

## A. Apple Developer account requirements (you must do these in Apple's portals)

- ⬜ **Apple Developer Program membership** — active, paid ($99/yr). Required to
  upload to TestFlight at all.
- ⬜ **App ID / Bundle ID registered** — `com.oneononespades.freeplay` created in
  the Apple Developer portal (Certificates, Identifiers & Profiles). With EAS this
  can be auto-created during `eas build`, but the membership must exist first.
- ⬜ **App record created in App Store Connect** — name "Spades Free Play",
  primary language, bundle ID linked.
- ⬜ **Distribution certificate + provisioning profile** — EAS manages these
  automatically when you run `eas build -p ios` and sign in with your Apple ID.
- ⬜ **Agreements, Tax, and Banking** — at minimum the free-app agreement must be
  active in App Store Connect or builds can't go live (TestFlight internal testing
  works without banking; public/external testing and release need the agreement).

> These five are **external** — they cannot be completed inside this repo. They
> are the gating items before any upload.

---

## B. App config (in-repo) — ✅ all set

| Item | Value | Status |
| --- | --- | --- |
| App name | Spades Free Play | ✅ |
| Marketing version | 1.0.0 | ✅ |
| iOS build number | 1 | ✅ |
| iOS bundle identifier | com.oneononespades.freeplay | ✅ |
| Android package / versionCode | com.oneononespades.freeplay / 1 | ✅ |
| Export-compliance flag | `usesNonExemptEncryption: false` | ✅ |
| Orientation | portrait | ✅ |
| Theme | dark (`userInterfaceStyle: "dark"`) | ✅ |

> Reminder: bump `ios.buildNumber` for **every** new TestFlight upload, even if
> the marketing version stays 1.0.0.

---

## C. App Store text (drafted — confirm/tweak before submit)

- ✅ **App name**: Spades Free Play
- ✅ **Subtitle** (≤30): Free 1v1 head-to-head Spades
- ✅ **Description**: drafted in `APP_STORE_CHECKLIST.md` §1 (free-play framing)
- ✅ **Keywords** (≤100): `spades,card game,1v1,trick taking,multiplayer,classic cards,head to head,free,bidding,nil`
- ⬜ **Promotional text** (optional, ≤170) — write if desired
- ✅ **Category**: Games › Card
- ✅ **Age rating**: 4+ (no gambling, no real-money play)

---

## D. Screenshots required (by screen) — ⬜ capture on device/simulator

Portrait, **6.7" iPhone (1290×2796)** set is mandatory. Capture these screens:

1. ⬜ Home — hero card fan + Quick Match / Play a Friend
2. ⬜ Game — bidding phase
3. ⬜ Game — playing a trick (hand + trick + scores)
4. ⬜ How Dealing Works — teaching animation
5. ⬜ How to Play — rules
6. ⬜ Fair Play

> iPad shots not needed (`ios.supportsTablet: false`).

---

## E. Required pages before upload — ⬜ must be live and substantive

| Page | URL (in `constants/links.ts`) | Status |
| --- | --- | --- |
| Privacy Policy | https://1v1spades.com/privacy | ⬜ Placeholder — publish real content |
| Terms of Use | https://1v1spades.com/terms | ⬜ Placeholder — publish real content |
| Support | https://1v1spades.com/support | ⬜ Placeholder — publish real content |

> 🚫 **Hard blocker for App Store review**: App Store Connect requires a working
> Privacy Policy URL and Support URL, and reviewers check the pages have real
> content (not a redirect to a generic landing page). TestFlight **internal**
> testing can proceed before these are final; **public** review cannot.

---

## F. Icon & splash — ✅ ready (one check left)

- ✅ Master icon `assets/images/icon.png` — 1024×1024 PNG, **no alpha** (RGB),
  which is what the App Store icon requires.
- ✅ Splash uses the icon on `#0b0b0d` (matches the in-app card-room theme).
- ⬜ Eyeball the icon on a real device home screen once (rounded-corner masking).

---

## G. Content compliance — ✅ verified

- ✅ No cash / deposit / wallet / prize / gambling / wager / payout / stake /
  buy-in / real-money wording in any user-facing screen (automated scan clean).
- ✅ In-app experience is free play only; tournaments/KOTT/admin are **not**
  present in the app. The only competitive reference is an external website link
  that opens in the browser.

---

## H. Exact remaining steps before TestFlight upload

1. ⬜ Activate Apple Developer Program membership (§A).
2. ⬜ Publish real Privacy, Terms, and Support pages at the URLs in §E.
3. ⬜ Create the app record in App Store Connect (§A).
4. ⬜ Install EAS CLI and configure: `npm i -g eas-cli`, then `eas login` and
   `eas build:configure` inside `artifacts/spades-freeplay`.
5. ⬜ Produce a signed iOS build: `eas build -p ios --profile production`
   (EAS will create/manage the cert + provisioning profile).
6. ⬜ Submit the build to TestFlight: `eas submit -p ios` (or upload the `.ipa`
   via Transporter).
7. ⬜ In App Store Connect: complete the App Privacy questionnaire (§6 of the
   asset checklist), add testers, and enable internal testing.
8. ⬜ Capture and upload the §D screenshots.
9. ⬜ Run the TestFlight tester checklist (§7 of `APP_STORE_CHECKLIST.md`).

> Note: EAS Build runs on Expo's servers, not in this Replit environment. Steps
> 4–6 are done from a terminal with your Apple credentials.

---

## I. In-repo readiness snapshot (re-run anytime)

- ✅ Expo dev server launches (HTTP 200)
- ✅ `pnpm run typecheck` passes
- ✅ `pnpm --filter @workspace/spades-core run test` — 19/19
- ✅ Protected web/server diff empty (no gameplay/server changes)
- ✅ Prohibited-wording scan clean in user-facing screens
