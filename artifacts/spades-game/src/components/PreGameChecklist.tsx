/**
 * Compact, collapsible pre-game checklist surfaced on lobby/waiting screens.
 * It reminds players how to avoid the connection pitfalls that strand people
 * mid-match (in-app browsers, private mode, stale tabs, multi-device).
 *
 * Purely informational — no behaviour, no gating.
 */
export function PreGameChecklist({
  className = "",
  defaultOpen = false,
}: {
  className?: string;
  defaultOpen?: boolean;
}) {
  const items = [
    "Open in Safari or Chrome (not an app's built-in browser)",
    "Avoid social app built-in browsers",
    "No private / incognito mode",
    "Close old game tabs",
    "One player, one device, one tab",
  ];

  return (
    <details
      open={defaultOpen}
      data-testid="pre-game-checklist"
      className={`group rounded-lg border border-primary/25 bg-white/5 px-3 py-2 text-left ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-primary/90 select-none">
        <span>✅ Before you play — quick checklist</span>
        <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => (
          <li
            key={it}
            className="flex items-start gap-2 text-xs leading-snug text-muted-foreground"
          >
            <span className="mt-0.5 text-emerald-400">✓</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
