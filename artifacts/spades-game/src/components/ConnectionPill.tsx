import { useSocket } from "@/hooks/useSocket";
import { ConnectionRecoveryActions } from "@/components/ConnectionRecoveryActions";

/**
 * Tiny fixed-position connection-status pill. Shows nothing when online
 * (no noise during normal play) and a labelled dot when connecting /
 * reconnecting / offline. Used on Lobby + Tournament pages; Room.tsx
 * renders its own in-place status pill in the header.
 */
export function ConnectionPill() {
  const { status } = useSocket();
  if (status === "online") return null;
  const map = {
    connecting:   { label: "Connecting…",                       cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", dot: "bg-amber-400" },
    reconnecting: { label: "Reconnecting…",                     cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", dot: "bg-amber-400 animate-pulse" },
    offline:      { label: "Offline — trying to reconnect",     cls: "border-destructive/40 bg-destructive/10 text-destructive", dot: "bg-destructive animate-pulse" },
  } as const;
  const v = map[status];
  return (
    <div
      className="fixed right-2 top-2 z-50 flex max-w-[calc(100vw-1rem)] flex-col items-end gap-2"
      data-testid="connection-pill"
    >
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider shadow-sm ${v.cls}`}
        role="status"
        aria-live="polite"
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${v.dot}`} />
        {v.label}
      </div>
      <ConnectionRecoveryActions compact />
    </div>
  );
}
