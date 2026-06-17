---
name: Spades theme token system
description: Where the visual theme lives and which surfaces bypass the tokens (must be hand-edited for any re-skin).
---

# Spades visual theme

The theme is centralized as HSL CSS variables in `artifacts/spades-game/src/index.css` (`:root` and `.dark`, plus the `body` background-image gradient). Components use semantic Tailwind classes (`bg-background`, `bg-card`, `text-primary`, `border-primary`, etc.), so retuning the tokens re-skins the lobby, tournament, KOTT, champion, SEO/info pages, and most of gameplay in one place. Current scheme: black/charcoal (hue ~40, low sat) + rich gold primary (`43 78% 53%`).

**Why:** a full re-skin (e.g. green-felt → black-gold) is mostly a token edit, NOT a component sweep.

**How to apply — surfaces that BYPASS the tokens and must be edited by hand:**
- `components/ShuffleOverlay.tsx` — card-back gradient AND the `deal-table-outline` inline-style `boxShadow`/`background` (these held hardcoded felt-green RGBA).
- `pages/Room.tsx` — waiting + spectator panel gradients (were `from-emerald-950…`), and the inactive bid-number buttons (were a hardcoded `#071f18` green).
- `components/Card.tsx` — playing-card faces are intentionally WHITE with standard suit colors (slate/red/blue/green incl. `text-emerald-700` clubs). Leave these for readability; they are not theme surfaces.
- Semantic status colors (green=ready/online/won, red=lost, yellow=warning) in `Room.tsx`/`HostDashboard.tsx`/`PreGameChecklist.tsx` are intentional — keep, don't theme them away.

When re-skinning, grep for `emerald`, `teal`, hardcoded hex, and `rgba(` with green-ish channels to catch these non-token spots. `text-primary-foreground` is near-black — only valid on `bg-primary` (gold) surfaces.
