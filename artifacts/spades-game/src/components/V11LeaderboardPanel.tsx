import { useEffect, useMemo, useState } from "react";
import {
  computeLeaderboardPanelState,
  formatBags,
  formatScoreTotal,
  formatSeasonLabel,
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
  const [expanded, setExpanded] = useState(false);

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
        if (!cancelled) setError("No ranked matches yet.");
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
  const visibleEntries = state.kind === "entries"
    ? state.entries.slice(0, expanded ? 10 : 3)
    : [];

  return (
    <section
      className="space-y-2 rounded-md border border-primary/30 bg-white/[0.03] p-3"
      data-testid="v11-leaderboard-panel"
    >
      <div className="space-y-2 text-center">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">
            Ranked Leaderboards Season 0
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {formatSeasonLabel(state.kind === "loading" || state.kind === "error" ? "v1_1_beta" : state.seasonKey)}
          </p>
        </div>
        {state.kind === "entries" && state.entries.length > 3 ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="rounded border border-primary/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary hover:bg-primary/10"
            data-testid="button-v11-leaderboard-top10"
          >
            {expanded ? "Top 3" : "Top 10"}
          </button>
        ) : (
          <span className="rounded border border-primary/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            Top 3
          </span>
        )}
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
        <ol className="space-y-2" data-testid="v11-leaderboard-list">
          {visibleEntries.map((entry) => (
            <li
              key={`${entry.rank}-${entry.username}`}
              className="rounded-md border border-border/40 bg-black/20 px-3 py-2.5"
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(74px,auto))] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    <span className="mr-2 font-mono text-primary">#{entry.rank}</span>
                    {entry.username}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground sm:block sm:text-center">
                  <span className="uppercase tracking-widest">Record</span>
                  <span className="font-mono text-foreground sm:mt-0.5 sm:block">{entry.wins}-{entry.losses}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground sm:block sm:text-center">
                  <span className="uppercase tracking-widest">Win</span>
                  <span className="font-mono text-foreground sm:mt-0.5 sm:block">{formatWinRate(entry.winRate)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground sm:block sm:text-center">
                  <span className="uppercase tracking-widest">Streak</span>
                  <span className="font-mono text-foreground sm:mt-0.5 sm:block">{formatStreak(entry.currentStreak)}</span>
                </div>
              </div>
              <div className="mt-2 grid gap-x-4 gap-y-1 border-t border-border/30 pt-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                <div className="flex items-center justify-between gap-2">
                  <span>Games</span>
                  <span className="font-mono text-foreground">{entry.gamesPlayed}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Points</span>
                  <span className="font-mono text-foreground">
                    {formatScoreTotal(entry.pointsFor)} / {formatScoreTotal(entry.pointsAgainst)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Bags taken</span>
                  <span className="font-mono text-foreground">+{formatBags(entry.bagsTaken)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>Bags given</span>
                  <span className="font-mono text-foreground">-{formatBags(entry.bagsGiven)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
