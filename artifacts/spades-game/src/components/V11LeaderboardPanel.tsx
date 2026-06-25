import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Crown, Flame, Gamepad2, Percent, Trophy } from "lucide-react";
import {
  computeLeaderboardPanelState,
  formatBags,
  formatScoreTotal,
  formatSeasonLabel,
  formatStreak,
  formatWinRate,
  latestLeaderboardUpdatedAt,
  leaderboardEndpoint,
  type V11LeaderboardEntry,
  type V11LeaderboardResponse,
} from "@/lib/v11LeaderboardPanel";
import { v11WebFlags } from "@/lib/v11Flags";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type LeaderboardVariant = "preview" | "full";

const STAT_TOOLTIPS = {
  games: "Completed ranked games this season.",
  winRate: "Wins divided by completed ranked games.",
  streak: "Current win or loss streak.",
  bags: "Bags taken / bags given this season.",
} as const;

function podiumClasses(rank: number) {
  if (rank === 1) {
    return {
      row: "border-amber-300/70 bg-gradient-to-r from-amber-500/20 via-black/30 to-black/20 shadow-[0_0_24px_rgba(245,158,11,0.16)]",
      marker: "border-amber-300/80 bg-amber-400/20 text-amber-200",
      badge: "border-amber-300/50 bg-amber-400/15 text-amber-100",
      label: "CHAMPION",
    };
  }
  if (rank === 2) {
    return {
      row: "border-slate-200/55 bg-gradient-to-r from-slate-200/14 via-black/25 to-black/20 shadow-[0_0_20px_rgba(226,232,240,0.10)]",
      marker: "border-slate-200/70 bg-slate-200/15 text-slate-100",
      badge: "border-slate-200/45 bg-slate-200/10 text-slate-100",
      label: "ELITE",
    };
  }
  if (rank === 3) {
    return {
      row: "border-orange-300/55 bg-gradient-to-r from-orange-500/16 via-black/25 to-black/20 shadow-[0_0_20px_rgba(251,146,60,0.10)]",
      marker: "border-orange-300/70 bg-orange-400/15 text-orange-100",
      badge: "border-orange-300/45 bg-orange-400/10 text-orange-100",
      label: "CONTENDER",
    };
  }
  return null;
}

function StatChip({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon: typeof Gamepad2;
  label: string;
  value: string | number;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="group flex min-h-11 items-center gap-2 rounded-md border border-border/45 bg-white/[0.04] px-2.5 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          aria-label={`${label}: ${tooltip}`}
        >
          <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </span>
            <span className="block font-mono text-xs font-semibold text-foreground">
              {value}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-52 text-center">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function LeaderboardRow({
  entry,
  variant,
}: {
  entry: V11LeaderboardEntry;
  variant: LeaderboardVariant;
}) {
  const podium = podiumClasses(entry.rank);
  const isTopRank = entry.rank === 1;

  return (
    <li
      className={cn(
        "rounded-md border bg-black/25 px-3 py-3 shadow-sm transition-colors",
        "border-border/45 hover:border-primary/45 hover:bg-white/[0.04]",
        podium?.row,
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.95fr)] lg:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/10 font-mono text-sm font-black text-primary",
              podium?.marker,
            )}
            aria-label={`Rank ${entry.rank}`}
          >
            {isTopRank ? <Crown className="h-5 w-5" aria-hidden /> : `#${entry.rank}`}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                {entry.username}
              </p>
              {podium && (
                <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest", podium.badge)}>
                  <Trophy className="h-3 w-3" aria-hidden />
                  {podium.label}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>
                Record{" "}
                <span className="font-mono font-semibold text-foreground">
                  {entry.wins}-{entry.losses}
                </span>
              </span>
              <span>
                Score{" "}
                <span className="font-mono font-semibold text-foreground">
                  {formatScoreTotal(entry.pointsFor)} / {formatScoreTotal(entry.pointsAgainst)}
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className={cn("grid grid-cols-2 gap-2", variant === "full" && "sm:grid-cols-4")}>
          <StatChip
            icon={Gamepad2}
            label="Games Played"
            value={entry.gamesPlayed}
            tooltip={STAT_TOOLTIPS.games}
          />
          <StatChip
            icon={Percent}
            label="Win Rate"
            value={formatWinRate(entry.winRate)}
            tooltip={STAT_TOOLTIPS.winRate}
          />
          <StatChip
            icon={Flame}
            label="Streak"
            value={formatStreak(entry.currentStreak)}
            tooltip={STAT_TOOLTIPS.streak}
          />
          <StatChip
            icon={Trophy}
            label="Bags"
            value={`+${formatBags(entry.bagsTaken)} / -${formatBags(entry.bagsGiven)}`}
            tooltip={STAT_TOOLTIPS.bags}
          />
        </div>
      </div>
    </li>
  );
}

export function V11LeaderboardPanel({
  variant = "preview",
  className,
}: {
  variant?: LeaderboardVariant;
  className?: string;
}) {
  const [data, setData] = useState<V11LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isFull = variant === "full";

  useEffect(() => {
    if (!v11WebFlags.leaderboards) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(leaderboardEndpoint(isFull ? 25 : 10))
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
  }, [isFull]);

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
  const visibleEntries =
    state.kind === "entries"
      ? isFull
        ? state.entries
        : state.entries.slice(0, expanded ? 10 : 3)
      : [];
  const lastUpdatedLabel = state.kind === "entries"
    ? latestLeaderboardUpdatedAt(state.entries)
    : null;

  return (
    <section
      className={cn(
        "space-y-3 rounded-md border border-primary/30 bg-white/[0.03] p-3",
        isFull && "border-primary/40 bg-card/70 p-4 shadow-[0_0_30px_rgba(234,179,8,0.08)] sm:p-5",
        className,
      )}
      data-testid="v11-leaderboard-panel"
    >
      <div className="space-y-3 text-center">
        <div>
          <h2 className={cn("font-semibold uppercase tracking-widest text-primary", isFull ? "text-base sm:text-lg" : "text-sm")}>
            Ranked Leaderboards Season 0
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {formatSeasonLabel(state.kind === "loading" || state.kind === "error" ? "v1_1_beta" : state.seasonKey)}
          </p>
          {lastUpdatedLabel && (
            <p className="mt-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/80">
              Updated {lastUpdatedLabel}
            </p>
          )}
        </div>
        {!isFull ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
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
            <Link
              href="/leaderboard"
              className="rounded border border-border/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:border-primary/40 hover:text-primary"
              data-testid="link-v11-full-leaderboard"
            >
              Full Board
            </Link>
          </div>
        ) : isFull && state.kind === "entries" ? (
          <span className="inline-flex rounded border border-primary/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
            Top {visibleEntries.length}
          </span>
        ) : null}
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
        <ol className={cn("space-y-2", isFull && "space-y-3")} data-testid="v11-leaderboard-list">
          {visibleEntries.map((entry) => (
            <LeaderboardRow key={`${entry.rank}-${entry.username}`} entry={entry} variant={variant} />
          ))}
        </ol>
      )}
    </section>
  );
}
