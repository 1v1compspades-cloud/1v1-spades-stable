# 1v1 Euchre iOS Wrapper

Expo iOS wrapper for the live 1v1 Euchre free-play web app.

## App

- App name: 1v1 Euchre
- Bundle ID: `com.oneononeeuchre.freeplay`
- Live URL: `https://1v1euchre.com`
- Version: `1.0.0`
- iOS build number: `1`
- Orientation: portrait
- Theme: dark

The native shell opens the public 1v1 Euchre site in a `react-native-webview` WebView. It does not use local development URLs and does not include game/server logic.

## Production Connection Gate

The wrapper checks `https://1v1euchre.com/healthz` before loading the WebView. If the live app is unavailable, it shows:

> Connection unavailable. Check internet or try again.

The app only loads pages from `https://1v1euchre.com`.

## Build

```sh
npm install
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

Run the commands from `apps/euchre-ios-wrapper`.

## Before TestFlight

- Deploy the latest Euchre web app to Render.
- Open `https://1v1euchre.com` on phone Safari.
- Confirm Create Room works.
- Confirm Quick Match page loads.
- Confirm Leaderboard loads.
- Confirm Tournament History loads.
