import { useEffect, useMemo, useState } from "react";
import {
  computeLeaderboardPanelState,
  formatBags,
  formatStreak,
  formatWinRate,
  leaderboardEndpoint,
  type V11LeaderboardResponse,
} from "@/lib/v11LeaderboardPanel";
import { v11WebFlags } from "@/lib/v11Flags";

export function V11LeaderboardPanel() {
  const [data, setData] = useState<V11LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!v11WebFlags.leaderboards) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(leaderboardEndpoint())
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message || "Leaderboard unavailable.");
        }
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setError("Leaderboard unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const state = useMemo(
    () =>
      computeLeaderboardPanelState({
        enabled: v11WebFlags.leaderboards,
        loading,
        error,
        data,
      }),
    [data, error, loading],
  );

  if (state.kind === "hidden") return null;

  return (
    <section
      className="space-y-2 rounded-md border border-border/50 bg-white/[0.03] p-2.5"
      data-testid="v11-leaderboard-panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">
            Ranked Leaderboard
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Season: {state.kind === "loading" || state.kind === "error" ? "v1_1_beta" : state.seasonKey}
          </p>
        </div>
        <span className="rounded border border-primary/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
          Top 10
        </span>
      </div>

      {state.kind === "loading" && (
        <p className="text-sm text-muted-foreground" data-testid="v11-leaderboard-loading">
          Loading leaderboard...
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-sm text-muted-foreground" data-testid="v11-leaderboard-error">
          {state.message}
        </p>
      )}

      {state.kind === "empty" && (
        <p className="text-sm text-muted-foreground" data-testid="v11-leaderboard-empty">
          No ranked matches yet.
        </p>
      )}

      {state.kind === "entries" && (
        <ol className="space-y-1.5" data-testid="v11-leaderboard-list">
          {state.entries.map((entry) => (
            <li
              key={`${entry.rank}-${entry.username}`}
              className="rounded-md border border-border/40 bg-black/20 px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    <span className="mr-2 font-mono text-primary">#{entry.rank}</span>
                    {entry.username}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {entry.wins}-{entry.losses} · {formatWinRate(entry.winRate)} win · streak {formatStreak(entry.currentStreak)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Bags +{formatBags(entry.bagsTaken)} / -{formatBags(entry.bagsGiven)}
                  </p>
                </div>
                <span className="shrink-0 rounded border border-border/50 px-2 py-1 text-[11px] font-mono text-muted-foreground">
                  {entry.gamesPlayed} GP
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
