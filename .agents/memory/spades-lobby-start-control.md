---
name: Spades tournament lobby start control
description: Why the lobby Start button can vanish for a host and how it must be gated
---

# Tournament lobby Start button

`iAmHost` in Tournament.tsx is NAME-based (`hostSnapshot` set when stored playerName matches `t.hostName`). It does NOT prove this device holds the host token. The host token lives in localStorage `spades_tournament_token_<code>` and is only present on the device that created the tournament (or one opened via the original host link).

## The failure mode
A host who opens the lobby on a device WITHOUT the host token (shared/non-host link, second device, cleared storage) is still `iAmHost` by name, but `startTournament` will be rejected server-side. If the UI gates the Start button purely on `iAmHost`, the host either sees a button that silently fails or — depending on layout — no button at all on mobile.

## The rule
Gate the *enabled* Start button on host-name match AND host-token capability, and when the host lacks that capability show a visible warning, never a hidden control. Capability = token present (`!!getTournamentToken(code)`) AND not server-rejected. "Invalid token" is only knowable after a start attempt: flip a `hostAuthFailed` flag when the start error message matches `/host/i`, and feed `hasHostToken && !hostAuthFailed` into the gating helper.

**Why:** a vanished/silently-broken Start button on the host's phone blocks the entire event from starting. A warning that tells them to reopen via the original host link is recoverable; a missing button is not.

**How to apply:** keep the gating logic in the pure helper `src/lib/hostControls.ts` (node:test-covered) so it stays testable without React; the component only renders the helper's result. The server (`start_tournament`) stays authoritative — this is UI affordance only.
