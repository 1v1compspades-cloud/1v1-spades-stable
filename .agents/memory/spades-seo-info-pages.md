---
name: Spades SEO info pages routing
description: Why public marketing/SEO pages are wouter routes (not static HTML) and how per-page head metadata is handled.
---

# Public SEO info pages (/rules, /tournaments, /king-of-the-table, /discord)

These are wouter `<Route>`s rendering React components, NOT static `public/*.html` files.

**Why:** the production deploy rewrites `/* -> /index.html`, so any extensionless
clean URL is served index.html and resolved client-side. Static HTML at clean URLs
would depend on unverified static-server clean-URL behavior and could fall through
to the SPA catch-all -> NotFound. Wouter routes work identically in dev (vite SPA
fallback) and prod (rewrite -> index.html -> React), and Googlebot renders the JS,
so the content is indexable.

**How to apply:**
- Add new marketing/SEO pages as wouter routes in `App.tsx` BEFORE the dynamic
  `/room/:roomCode` and `/tournament/:code` routes and the NotFound catch-all.
  (`/tournaments` is distinct from `/tournament/:code` — no conflict.)
- Per-page `<title>`/description/canonical/OG/twitter are set at runtime by the
  `Seo` component (`src/components/Seo.tsx`) via a useEffect; it snapshots and
  restores prior head state on unmount so SPA nav back into the game doesn't leave
  stale canonical/description. There is no SSR — head tags are JS-set only.
- Canonical/OG URLs hardcode `https://1v1spades.com<path>`.
- Shared chrome lives in `src/components/InfoPageLayout.tsx`; pages in `src/pages/info/`.
- These pages don't use sockets (socket autoConnect is false), so they stay lightweight.
