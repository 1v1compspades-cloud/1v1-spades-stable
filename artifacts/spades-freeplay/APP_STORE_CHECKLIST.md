# 1v1 Spades — App Store / TestFlight Readiness Checklist

A launch-prep checklist for the casual iOS app. This app is casual play only:
no tournaments, no cash, no paid entries, no deposits, no wallets, no prizes,
no gambling. Competitive tournaments live on the external website and open in
the device browser.

---

## 1. App metadata

| Field | Value |
| --- | --- |
| **App name** | 1v1 Spades |
| **Subtitle** (≤30 chars) | 1v1 head-to-head Spades |
| **Bundle ID** | `com.oneononespades.freeplay` |
| **Version / Build** | 1.0.0 (build 1) |
| **Primary category** | Games |
| **Secondary category** | Card |
| **Age rating** | 4+ (no objectionable content; no gambling, no real-money play) |

### Description (draft)

> 1v1 Spades is a fast, head-to-head take on the classic trick-taking
> card game. One opponent, one deck, pure skill.
>
> • Quick Match — spin up a private table and share the code instantly
> • Play a Friend — create or join a table with a 5-letter code
> • Real-time 1v1 over the internet
> • Hidden hands, bidding, nil bids, and full Spades scoring
> • A guided "How Dealing Works" animation for new players
> • A premium black-and-gold card-room look
>
> Casual play only — every game is for bragging rights, with nothing on the line.
> No stakes, no catches, just you and the cards.

### Keywords (≤100 chars, comma-separated)

> spades,card game,1v1,trick taking,multiplayer,classic cards,head to head,bidding,nil

---

## 2. Required URLs (placeholders — confirm live before submission)

| Purpose | URL | Status |
| --- | --- | --- |
| **Privacy Policy** | https://1v1spades.com/privacy | ⬜ Placeholder — must resolve |
| **Terms of Use** | https://1v1spades.com/terms | ⬜ Placeholder — must resolve |
| **Support** | https://1v1spades.com/support | ⬜ Placeholder — must resolve |
| **Marketing** | https://1v1spades.com | ✅ Live |

> All three legal links are wired into the app home screen footer and read from
> `constants/links.ts`. App Store Connect **requires** a reachable Privacy Policy
> URL and a Support URL; Terms is required if you reference one in-app (we do).

---

## 3. App icon

| Item | Status |
| --- | --- |
| 1024×1024 master icon (`assets/images/icon.png`) | ✅ Present (1024×1024 PNG) |
| No alpha / transparency in store icon | ⬜ Verify (App Store icon must be opaque) |
| Adaptive/rounded handled by OS | ✅ OS applies mask |

---

## 4. Screenshots needed (per App Store Connect)

iPhone screenshots are mandatory. Capture in **portrait** on the App Store
Connect display classes below. Use the automation from this package:

```sh
pnpm run appstore:screenshots -- --app /path/to/1v1-spades.app
```

The script captures and validates the current Apple-accepted portrait sizes:

- ⬜ 6.3" — 1179×2556 or 1206×2622
- ⬜ 6.5" — 1284×2778 or 1242×2688

Suggested shots (5–6):

1. ⬜ Home screen (hero card fan + Quick Match / Play a Friend)
2. ⬜ Live game — bidding phase
3. ⬜ Live game — playing a trick (hand + current trick + scores)
4. ⬜ "How Dealing Works" teaching animation
5. ⬜ How to Play (rules) screen
6. ⬜ Fair Play screen

> iPad screenshots are **not** required — `ios.supportsTablet` is `false`.

---

## 5. Build & submission config

| Item | Status |
| --- | --- |
| `userInterfaceStyle` dark (matches card-room theme) | ✅ Set |
| Splash background matches theme (`#0b0b0d`) | ✅ Set |
| `ios.bundleIdentifier` set | ✅ `com.oneononespades.freeplay` |
| `ios.buildNumber` set | ✅ `1` |
| Encryption declaration (`usesNonExemptEncryption: false`) | ✅ Set (skips export-compliance prompt) |
| Apple Developer account + App ID created | ⬜ Do in Apple Developer portal |
| App record created in App Store Connect | ⬜ |
| EAS Build configured (`eas build -p ios`) | ⬜ |
| EAS Submit / Transporter upload | ⬜ |

---

## 6. App privacy ("nutrition label") answers

| Question | Answer |
| --- | --- |
| Collects data? | Display name (entered per table) + connection metadata only |
| Linked to identity? | No accounts; display names are ephemeral and not tied to an identity |
| Tracking (IDFA)? | No |
| Third-party analytics/ads SDKs? | None |

> Fill the App Store Connect privacy questionnaire to match the above. Keep it
> minimal — the app has no login, no ads, and no third-party trackers.

---

## 7. TestFlight tester checklist

Have each tester confirm:

- ⬜ App installs and launches to onboarding on first run
- ⬜ Onboarding Skip / Back / Next / Start all work; doesn't reappear after finishing
- ⬜ "Take the tour" replays onboarding from home
- ⬜ **Quick Match**: create a table, share code, second device joins, both ready up, game starts
- ⬜ **Play a Friend**: create + join by 5-letter code both work
- ⬜ Full game plays end-to-end: coin toss → bidding → playing → round over → game over
- ⬜ New Match / Leave from the game-over screen work
- ⬜ Reconnect: background/relaunch returns the player to their seat
- ⬜ "How Dealing Works": animation plays, Skip / Fast Deal / Replay all work
- ⬜ How to Play and Fair Play screens render correctly
- ⬜ External links open in the browser: Website, Tournaments, Discord, Privacy, Terms, Support
- ⬜ Black/gold theme is consistent across every screen
- ⬜ Layout is safe on notch + home-indicator devices (no clipped content)
- ⬜ No cash / deposit / wallet / prize / gambling wording anywhere

---

## 8. Pre-submit sanity (already automated in this repo)

- ✅ `pnpm run typecheck` passes
- ✅ `pnpm --filter @workspace/spades-core run test` passes
- ✅ Protected web/server diff is empty (no gameplay/server changes)
- ✅ Prohibited-wording scan is clean
